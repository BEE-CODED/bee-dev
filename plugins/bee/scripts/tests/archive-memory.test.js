#!/usr/bin/env node
// Test: archive-memory.sh is a well-formed bash script that emits an explicit
// status line to stdout for each outcome (success-with-content, no-op-no-dir,
// no-op-empty) and prints error messages to stderr with exit 1 on failure.
// It preserves the existing shared.md project-level filter logic. These are
// STRUCTURAL assertions -- the test reads the script file as text and asserts
// on the source. No real memory directory is manipulated.

const fs = require('fs');
const path = require('path');

const SCRIPT_PATH = path.join(
  __dirname, '..', 'archive-memory.sh'
);

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${testName}`);
  } else {
    failed++;
    console.log(`  FAIL: ${testName}`);
  }
}

// Read the file under test
let content;
let stat;
try {
  content = fs.readFileSync(SCRIPT_PATH, 'utf8');
  stat = fs.statSync(SCRIPT_PATH);
} catch (e) {
  console.log('FAIL: archive-memory.sh does not exist at expected path');
  console.log(`  Expected: ${SCRIPT_PATH}`);
  console.log(`\nResults: 0 passed, 1 failed out of 1 assertions`);
  process.exit(1);
}

// ============================================================
// Test 1: File exists and is executable
// ============================================================
console.log('Test 1: File exists and is executable');
assert(
  fs.existsSync(SCRIPT_PATH),
  'archive-memory.sh exists at plugins/bee/scripts/archive-memory.sh'
);
assert(
  (stat.mode & 0o111) !== 0,
  'archive-memory.sh has execute bit set (chmod +x)'
);

// ============================================================
// Test 2: Shebang is /bin/bash (consistent with existing non-hive scripts)
// ============================================================
console.log('\nTest 2: Shebang');
assert(
  content.startsWith('#!/bin/bash'),
  'Script starts with #!/bin/bash shebang (consistent with existing non-hive scripts)'
);

// ============================================================
// Test 3: Does NOT use `set -e` (per existing bee script convention)
// ============================================================
console.log('\nTest 3: No `set -e` (explicit checks convention)');
assert(
  !/^\s*set\s+-e\b/m.test(content),
  'Script does not use `set -e` (relies on explicit checks like other bee scripts)'
);

// ============================================================
// Test 4: Success case with content emits "archived N file(s) to ..."
// ============================================================
console.log('\nTest 4: Success case stdout feedback');
assert(
  /echo\s+["']archived\s+/.test(content) ||
    /echo\s+"archived\s+/.test(content),
  'Emits "archived ..." status line for success with content'
);
assert(
  content.includes('.bee/memory-archive/') ||
    content.includes('memory-archive'),
  'Success message references the memory-archive destination path'
);

// ============================================================
// Test 5: No-op (no memory directory) emits status line
// ============================================================
console.log('\nTest 5: No-op no-directory stdout feedback');
assert(
  /echo\s+"no memory to archive/.test(content) ||
    /echo\s+'no memory to archive/.test(content),
  'Emits "no memory to archive" status line for no-op case(s)'
);
// There must be at least two distinct no-op branches -- one for missing
// directory, one for empty-after-filter. Count echo occurrences that match.
const noOpEchoMatches = content.match(/echo\s+["']no memory to archive/g) || [];
assert(
  noOpEchoMatches.length >= 2,
  `Has at least 2 "no memory to archive" echo statements (missing dir + empty) -- found ${noOpEchoMatches.length}`
);

// ============================================================
// Test 6: Error path prints to stderr and exits 1
// ============================================================
console.log('\nTest 6: Error path writes to stderr and exits 1');
assert(
  /echo\s+"error:/.test(content) ||
    /echo\s+'error:/.test(content),
  'Error path uses "error:" prefix in echo output'
);
assert(
  /echo[^\n]*>&2/.test(content),
  'Error path redirects echo to stderr with >&2'
);
assert(
  /\bexit\s+1\b/.test(content),
  'Error path contains exit 1 (non-zero exit code)'
);

// ============================================================
// Test 7: Preserves existing filter logic (grep for shared.md)
// ============================================================
console.log('\nTest 7: Preserves existing shared.md filter logic');
assert(
  content.includes('shared.md'),
  'Script still references shared.md for project-level filtering'
);
assert(
  content.includes('\\<(pattern|convention|prefer') ||
    content.includes('pattern|convention|prefer'),
  'Script still applies the keyword grep filter to keep project-level entries'
);
// Regression guard for F-002: the grep filter must use \< \> word boundaries
// so short keywords (ci, git, build) don't substring-match common words
// (decision, digit, rebuild) and leak spec-specific entries into shared.md.
assert(
  content.includes('\\<(pattern|convention|prefer') &&
    content.includes('database|migration)\\>'),
  'Keyword filter is wrapped in \\< \\> word boundaries (F-002 regression guard)'
);
assert(
  content.includes('memory-archive'),
  'Script still writes to memory-archive destination'
);

// ============================================================
// Test 8: mkdir/cp checked (no silent filesystem failure)
// ============================================================
console.log('\nTest 8: mkdir and cp are guarded for failure');
// The implementation should check mkdir success and cp success and branch to
// the error path on failure. Look for either `if ! mkdir` style or explicit
// `|| { echo error; exit 1; }` chains.
const mkdirGuard =
  /if\s*!\s*mkdir/.test(content) ||
  /mkdir\b[^\n]*\|\|\s*\{[^}]*exit\s+1/.test(content) ||
  /mkdir\b[^\n]*\|\|\s*\(\s*echo[^)]*exit\s+1/.test(content);
assert(
  mkdirGuard,
  'mkdir call is guarded for failure (if ! or ||-chain to error exit)'
);
const cpGuard =
  /if\s*!\s*cp/.test(content) ||
  /\bcp\b[^\n]*\|\|\s*\{[^}]*exit\s+1/.test(content) ||
  /\bcp\b[^\n]*\|\|\s*\(\s*echo[^)]*exit\s+1/.test(content);
assert(
  cpGuard,
  'cp call is guarded for failure (if ! or ||-chain to error exit)'
);

// ============================================================
// Test 9: Counts files archived (so success message can say N)
// ============================================================
console.log('\nTest 9: Counts archived files for success message');
// The script must track a count used in the archived echo. Accept any
// incrementing variable or find|wc pattern that feeds into the echo.
const hasCounter =
  /COUNT=\s*\$\(\(\s*COUNT\s*\+\s*1\s*\)\)/.test(content) ||
  /COUNT=\$\(\(\$COUNT\+1\)\)/.test(content) ||
  /count\+=1/.test(content) ||
  /find\s+[^|\n]+\|\s*wc\s+-l/.test(content) ||
  /ls\s+[^|\n]+\|\s*wc\s+-l/.test(content);
assert(
  hasCounter,
  'Script counts archived files (either increment counter or find|wc -l)'
);

// ============================================================
// Test 10: Safety checks
// ============================================================
console.log('\nTest 10: Safety checks');
assert(
  !/rm\s+-rf\s+\//.test(content),
  'Does not contain rm -rf / (safety check)'
);
assert(
  !/rm\s+-rf\s+\$\{?HOME\}?/.test(content),
  'Does not contain rm -rf $HOME (safety check)'
);

// ============================================================
// Test 11: Success path still reaches exit 0
// ============================================================
console.log('\nTest 11: Success exit 0');
assert(
  /\bexit\s+0\b/.test(content),
  'Script still exits 0 on success/no-op paths'
);

// ============================================================
// Results
// ============================================================
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
process.exit(failed > 0 ? 1 : 0);
