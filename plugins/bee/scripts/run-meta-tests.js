#!/usr/bin/env node
// Aggregate runner for bee's own meta-test suites.
//
// CLI contract (consumed by pre-commit-gate.sh and the Phase-2 triage tooling):
//   node run-meta-tests.js --root <repo>                      full run
//   node run-meta-tests.js --root <repo> --subset s1 s2 ...   subset run (repo-relative or absolute)
//   node run-meta-tests.js --root <repo> --subset-stdin       subset list on stdin, one per line
//   node run-meta-tests.js --root <repo> --generate [--force] write the known-failing baseline
// Options:
//   --budget-ms <n>        overall wallclock budget for subset mode (default: none)
//   --suite-timeout-ms <n> per-suite kill timeout (default 120000)
//   --baseline <path>      baseline file (default: plugins/bee/scripts/meta-test-baseline.txt under --root)
//   --list                 print the discovered roster (repo-relative POSIX paths) and exit 0
//
// Suite discovery (dynamic, no hardcoded roster): plugins/bee/scripts/tests/*.test.js,
// plugins/bee/scripts/*.test.js, plugins/bee/scripts/tests/test-*.sh. The runner and its
// own test file are excluded from discovery. All paths are resolved from --root (or cwd),
// NEVER from __dirname: the pre-commit gate executes from the installed plugin cache and
// must run the working tree's runner over the working tree's suites.
//
// Suite identifiers are repo-relative POSIX paths everywhere: subset input, baseline
// entries, and report lines. Inputs are normalized before baseline-membership comparison.
//
// Status tokens (load-bearing; the gate's bash parses these literals — no variants):
//   PASS  suite exited 0
//   FAIL  suite exited non-zero, or was killed by its per-suite timeout with budget remaining
//   WARN  suite FAILed but is in the known-failing baseline (never blocks)
//   SKIP  suite not run: overall budget expired, or subset entry not found on disk (never blocks)
//
// Exit codes — run modes (full + subset):
//   0  every suite PASS (WARN/SKIP allowed)
//   1  at least one non-baselined FAIL
//   2  infrastructure failure, no suites executed (bad root, discovery crash)
// Exit codes — generation mode (DELIBERATELY different: failing suites are the normal
// input to generation; recording them IS success):
//   0  baseline written (regardless of how many suites failed)
//   1  ratchet-guard refusal: an existing baseline is present and the newly-failing set
//      is NOT a subset of it — would-be additions are printed, nothing written.
//      Override only with an explicit --force (re-hides regressions; use deliberately).
//   2  infrastructure failure, nothing written

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_BASELINE = 'plugins/bee/scripts/meta-test-baseline.txt';
const SELF = 'plugins/bee/scripts/run-meta-tests.js';
const SELF_TEST = 'plugins/bee/scripts/tests/run-meta-tests.test.js';

function parseArgs(argv) {
  const args = { subset: null, generate: false, force: false, list: false,
    budgetMs: null, suiteTimeoutMs: 120000, root: process.cwd(), baseline: null,
    subsetStdin: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') args.root = argv[++i];
    else if (a === '--subset') { args.subset = []; while (argv[i + 1] && !argv[i + 1].startsWith('--')) args.subset.push(argv[++i]); }
    else if (a === '--subset-stdin') args.subsetStdin = true;
    else if (a === '--generate') args.generate = true;
    else if (a === '--force') args.force = true;
    else if (a === '--list') args.list = true;
    else if (a === '--budget-ms') args.budgetMs = parseInt(argv[++i], 10);
    else if (a === '--suite-timeout-ms') args.suiteTimeoutMs = parseInt(argv[++i], 10);
    else if (a === '--baseline') args.baseline = argv[++i];
  }
  return args;
}

// Repo-relative POSIX path — the canonical suite identifier. Realpath the input when
// possible so symlinked tmpdirs (macOS /var -> /private/var) normalize consistently
// with the realpath'd root.
function normalize(p, root) {
  let abs = path.isAbsolute(p) ? p : path.resolve(root, p);
  try { abs = fs.realpathSync(abs); } catch { /* nonexistent (deleted/SKIP case) — use as-is */ }
  return path.relative(root, abs).split(path.sep).join('/');
}

function discover(root) {
  const out = [];
  const testsDir = path.join(root, 'plugins/bee/scripts/tests');
  const scriptsDir = path.join(root, 'plugins/bee/scripts');
  if (fs.existsSync(testsDir)) {
    for (const f of fs.readdirSync(testsDir)) {
      if (f.endsWith('.test.js') || (f.startsWith('test-') && f.endsWith('.sh'))) {
        out.push(`plugins/bee/scripts/tests/${f}`);
      }
    }
  }
  if (fs.existsSync(scriptsDir)) {
    for (const f of fs.readdirSync(scriptsDir)) {
      if (f.endsWith('.test.js')) out.push(`plugins/bee/scripts/${f}`);
    }
  }
  return out.filter(s => s !== SELF && s !== SELF_TEST).sort();
}

function readBaseline(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

function runSuite(suiteRel, root, timeoutMs) {
  const abs = path.join(root, suiteRel);
  const cmd = suiteRel.endsWith('.sh') ? 'bash' : 'node';
  const res = spawnSync(cmd, [abs], { cwd: root, timeout: timeoutMs, encoding: 'utf8' });
  // res.signal set => killed by timeout; res.error => spawn problem
  if (res.error && res.error.code !== 'ETIMEDOUT') return { status: 'FAIL', detail: String(res.error) };
  if (res.signal || (res.error && res.error.code === 'ETIMEDOUT')) return { status: 'FAIL', detail: `killed (per-suite timeout ${timeoutMs}ms)` };
  return { status: res.status === 0 ? 'PASS' : 'FAIL', detail: '' };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let root;
  try {
    root = fs.realpathSync(args.root);
    if (!fs.existsSync(path.join(root, 'plugins/bee/scripts'))) {
      process.stderr.write(`run-meta-tests: not a bee repo root: ${root}\n`);
      process.exit(2);
    }
  } catch (e) {
    process.stderr.write(`run-meta-tests: bad --root: ${e.message}\n`);
    process.exit(2);
  }

  const baselineFile = path.isAbsolute(args.baseline || '')
    ? args.baseline : path.join(root, args.baseline || DEFAULT_BASELINE);

  let roster;
  try { roster = discover(root); } catch (e) {
    process.stderr.write(`run-meta-tests: discovery failed: ${e.message}\n`);
    process.exit(2);
  }

  if (args.list) { roster.forEach(s => process.stdout.write(s + '\n')); process.exit(0); }

  // --- generation mode -------------------------------------------------------
  if (args.generate) {
    const failing = [];
    for (const suite of roster) {
      const r = runSuite(suite, root, args.suiteTimeoutMs);
      process.stdout.write(`${r.status === 'PASS' ? 'PASS' : 'FAIL'} ${suite}\n`);
      if (r.status !== 'PASS') failing.push(suite);
    }
    const existing = readBaseline(baselineFile);
    if (existing.length > 0 && !args.force) {
      const additions = failing.filter(s => !existing.includes(s));
      if (additions.length > 0) {
        process.stdout.write(`REFUSED: ${additions.length} would-be baseline addition(s) — a previously-green suite now fails (or post-baseline drift):\n`);
        additions.forEach(s => process.stdout.write(`  + ${s}\n`));
        process.stdout.write('Nothing written. Fix the regression or pass --force (re-hides it — deliberate use only).\n');
        process.exit(1);
      }
    }
    try {
      fs.writeFileSync(baselineFile,
        '# bee known-failing meta-test baseline — suites listed here WARN instead of BLOCK at the\n' +
        '# pre-commit self-gate. Ratchets DOWN only (run-meta-tests.js --generate refuses additions\n' +
        '# without --force). Empty file = every failure blocks.\n' +
        failing.map(s => s + '\n').join(''));
    } catch (e) {
      process.stderr.write(`run-meta-tests: cannot write baseline: ${e.message}\n`);
      process.exit(2);
    }
    process.stdout.write(`BASELINE ${failing.length} failing of ${roster.length} suites -> ${normalize(baselineFile, root)}\n`);
    process.exit(0);
  }

  // --- run modes (full / subset) ---------------------------------------------
  let toRun = roster;
  if (args.subsetStdin) {
    const stdin = fs.readFileSync(0, 'utf8');
    args.subset = stdin.split('\n').map(l => l.trim()).filter(Boolean);
  }
  if (args.subset) toRun = args.subset.map(s => normalize(s, root));

  const baseline = readBaseline(baselineFile).map(s => normalize(s, root));
  const deadline = args.budgetMs ? Date.now() + args.budgetMs : null;
  let pass = 0, fail = 0, warn = 0, skip = 0;
  const blockers = [];

  for (const suite of toRun) {
    if (deadline && Date.now() >= deadline) {
      process.stdout.write(`SKIP ${suite} (budget expired — run the full aggregate: node ${SELF})\n`);
      skip++; continue;
    }
    if (!fs.existsSync(path.join(root, suite))) {
      process.stdout.write(`SKIP ${suite} (not found on disk)\n`);
      skip++; continue;
    }
    const remaining = deadline ? Math.max(1, deadline - Date.now()) : args.suiteTimeoutMs;
    const perSuite = Math.min(args.suiteTimeoutMs, remaining);
    const r = runSuite(suite, root, perSuite);
    if (r.status === 'PASS') { process.stdout.write(`PASS ${suite}\n`); pass++; }
    else if (baseline.includes(suite)) { process.stdout.write(`WARN ${suite} (baselined known-failing)\n`); warn++; }
    else {
      process.stdout.write(`FAIL ${suite}${r.detail ? ' (' + r.detail + ')' : ''}\n`);
      fail++; blockers.push(suite);
    }
  }

  process.stdout.write(`SUMMARY total=${toRun.length} pass=${pass} fail=${fail} warn=${warn} skip=${skip}\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
