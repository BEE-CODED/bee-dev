#!/usr/bin/env node
// Test: Vendor citation contract is enforced across all reviewer/auditor agents,
// validators, skills/templates, and commands with inline finding format hardcodes.
//
// Contract:
//   - Every finding-producing agent must instruct predominant vendor citation and
//     drop unverifiable findings (no pure-[ASSUMED] findings ship).
//   - Every producer must reference the [CITED] and [VERIFIED] tags using the exact
//     bracket notation established by agents/researcher.md:122-128.
//   - Validators (finding-validator, audit-finding-validator) must run a cheap
//     format-only fabrication check on [VERIFIED] claims AND drop findings whose
//     Evidence Strength is missing or [ASSUMED].
//   - review-report.md template carries the Evidence Strength and Citation fields.
//   - review/SKILL.md and audit/SKILL.md document the fields, the 13-field count
//     (review only -- audit skill has its own structure), and the drop policy.
//   - Commands with inline finding-format hardcodes include both new fields.

const fs = require('fs');
const path = require('path');

const PLUGIN_DIR = path.join(__dirname, '..', '..');
const AGENTS_DIR = path.join(PLUGIN_DIR, 'agents');
const SKILLS_DIR = path.join(PLUGIN_DIR, 'skills');
const COMMANDS_DIR = path.join(PLUGIN_DIR, 'commands');

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

function readFile(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Agent inventories
// ---------------------------------------------------------------------------

// Tier A producers -- have Context7 in frontmatter, full vendor-citation contract.
const TIER_A_PRODUCERS = [
  'bug-detector.md',
  'stack-reviewer.md',
  'audit-bug-detector.md',
  'security-auditor.md',
  'api-auditor.md',
];

// Tier B producers -- no Context7, cite vendor docs directly / use codebase trace.
const TIER_B_PRODUCERS = [
  'pattern-reviewer.md',
  'plan-compliance-reviewer.md',
  'database-auditor.md',
  'performance-auditor.md',
  'frontend-auditor.md',
  'error-handling-auditor.md',
  'testing-auditor.md',
  'integration-checker.md',
  'architecture-auditor.md',
  'dependency-auditor.md',
  'ui-auditor.md',
  'test-auditor.md',
  'integrity-auditor.md',
  'spec-reviewer.md',
  'plan-reviewer.md',
  'debug-investigator.md',
];

// Stack variants -- also producers, same Tier A contract as generic bug-detector.
const STACK_VARIANT_PRODUCERS = [
  path.join('stacks', 'laravel-inertia-vue', 'bug-detector.md'),
];

// Tier C validators -- enforce the contract, do not produce findings themselves.
const TIER_C_VALIDATORS = [
  'finding-validator.md',
  'audit-finding-validator.md',
];

const ALL_PRODUCERS = [
  ...TIER_A_PRODUCERS,
  ...TIER_B_PRODUCERS,
  ...STACK_VARIANT_PRODUCERS,
];

// ---------------------------------------------------------------------------
// Regexes for the contract
// ---------------------------------------------------------------------------

// Predominant-vendor-citation phrase appears in the producer prompt.
// Accepts either "predominant" wording OR "cite ... vendor docs" wording.
const PREDOMINANT_CITATION_RE =
  /(predominant[\s\S]{0,120}citation|cite[\s\S]{0,40}vendor[\s\S]{0,40}docs|vendor citation is the predominant)/i;

// Drop-unverifiable instruction: some phrasing that says "if you can't verify, drop".
const DROP_UNVERIFIABLE_RE =
  /(do NOT include the finding|drop[\s\S]{0,80}(assumed|unverif|unbacked|finding)|no pure[- ]?`?\[ASSUMED\]`? findings ship)/i;

// Dangerous "report any HIGH-confidence finding" without a cite/verify qualifier nearby.
// Matches only when such a phrase appears AND no qualifier is found within 250 chars
// following it. We don't actually expect this phrase post-edit -- it's a negative check.
function hasUnqualifiedReportAllInstruction(content) {
  const patt = /report any HIGH[- ]?confidence finding/gi;
  let m;
  while ((m = patt.exec(content)) !== null) {
    const tail = content.substr(m.index, 250);
    if (!/(verify|cite|citation|\[VERIFIED\]|\[CITED\]|drop)/i.test(tail)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Producer tests
// ---------------------------------------------------------------------------

console.log('=== Producer agents: vendor citation contract ===');

for (const rel of ALL_PRODUCERS) {
  const p = path.join(AGENTS_DIR, rel);
  const content = readFile(p);
  console.log(`\nAgent: ${rel}`);

  assert(content !== null, `${rel} exists and is readable`);
  if (content === null) continue;

  assert(
    !hasUnqualifiedReportAllInstruction(content),
    `${rel} does NOT contain an unqualified "report any HIGH-confidence finding" instruction`
  );

  assert(
    PREDOMINANT_CITATION_RE.test(content),
    `${rel} contains the predominant-vendor-citation instruction`
  );

  assert(
    DROP_UNVERIFIABLE_RE.test(content),
    `${rel} contains the drop-unverifiable (no pure-[ASSUMED]) instruction`
  );

  assert(
    content.includes('[CITED]'),
    `${rel} references the [CITED] tag using exact bracket notation`
  );

  assert(
    content.includes('[VERIFIED]'),
    `${rel} references the [VERIFIED] tag using exact bracket notation`
  );
}

// ---------------------------------------------------------------------------
// Validator tests
// ---------------------------------------------------------------------------

console.log('\n\n=== Validator agents: format-only fabrication check + drop ===');

const FORMAT_CHECK_RE =
  /(format[- ]only[\s\S]{0,60}(check|verification|fabrication)|URL plausibility|library ID format|Context7 library ID)/i;

const DROP_ASSUMED_RE =
  /(\[ASSUMED\][\s\S]{0,160}(reject|drop|false positive)|missing[\s\S]{0,30}Evidence Strength|no Evidence Strength)/i;

for (const rel of TIER_C_VALIDATORS) {
  const p = path.join(AGENTS_DIR, rel);
  const content = readFile(p);
  console.log(`\nValidator: ${rel}`);

  assert(content !== null, `${rel} exists and is readable`);
  if (content === null) continue;

  assert(
    FORMAT_CHECK_RE.test(content),
    `${rel} contains the format-only fabrication check on [VERIFIED] claims`
  );

  assert(
    DROP_ASSUMED_RE.test(content),
    `${rel} drops findings with missing or [ASSUMED] Evidence Strength`
  );

  assert(
    content.includes('Evidence Strength'),
    `${rel} names the "Evidence Strength" field explicitly`
  );

  assert(
    content.includes('[CITED]') && content.includes('[VERIFIED]'),
    `${rel} references both [CITED] and [VERIFIED] tags`
  );
}

// ---------------------------------------------------------------------------
// Schema / skill tests
// ---------------------------------------------------------------------------

console.log('\n\n=== Schema + skill files ===');

const REVIEW_REPORT = readFile(path.join(SKILLS_DIR, 'core', 'templates', 'review-report.md'));
const REVIEW_SKILL = readFile(path.join(SKILLS_DIR, 'review', 'SKILL.md'));
const AUDIT_SKILL = readFile(path.join(SKILLS_DIR, 'audit', 'SKILL.md'));

console.log('\nreview-report.md');
assert(REVIEW_REPORT !== null, 'review-report.md template exists');
if (REVIEW_REPORT !== null) {
  assert(
    REVIEW_REPORT.includes('Evidence Strength') &&
      REVIEW_REPORT.includes('[CITED]') &&
      REVIEW_REPORT.includes('[VERIFIED]'),
    'review-report.md finding template exposes "Evidence Strength" with [CITED] | [VERIFIED]'
  );
  assert(
    REVIEW_REPORT.includes('Citation:'),
    'review-report.md finding template exposes "Citation:" field'
  );
  assert(
    /drop|ASSUMED|rejected at finding-validator/i.test(REVIEW_REPORT),
    'review-report.md header comment documents the drop-policy reference'
  );
}

console.log('\nreview/SKILL.md');
assert(REVIEW_SKILL !== null, 'review/SKILL.md exists');
if (REVIEW_SKILL !== null) {
  assert(
    REVIEW_SKILL.includes('Evidence Strength'),
    'review/SKILL.md documents the "Evidence Strength" field'
  );
  assert(
    REVIEW_SKILL.includes('Citation'),
    'review/SKILL.md documents the "Citation" field'
  );
  assert(
    REVIEW_SKILL.includes('13 fields'),
    'review/SKILL.md updates the field count to "13 fields"'
  );
  assert(
    /Evidence Requirement[\s\S]{0,40}Drop Policy|## Evidence Requirement|Drop Policy/i.test(
      REVIEW_SKILL
    ),
    'review/SKILL.md has an Evidence Requirement / Drop Policy section'
  );
  assert(
    REVIEW_SKILL.includes('[CITED]') &&
      REVIEW_SKILL.includes('[VERIFIED]') &&
      REVIEW_SKILL.includes('[ASSUMED]'),
    'review/SKILL.md references all three tags using exact bracket notation'
  );
}

console.log('\naudit/SKILL.md');
assert(AUDIT_SKILL !== null, 'audit/SKILL.md exists');
if (AUDIT_SKILL !== null) {
  assert(
    AUDIT_SKILL.includes('Evidence Strength'),
    'audit/SKILL.md documents the "Evidence Strength" field'
  );
  assert(
    AUDIT_SKILL.includes('Citation'),
    'audit/SKILL.md documents the "Citation" field'
  );
  assert(
    /Evidence Requirement[\s\S]{0,40}Drop Policy|## Evidence Requirement|Drop Policy/i.test(
      AUDIT_SKILL
    ),
    'audit/SKILL.md has an Evidence Requirement / Drop Policy section'
  );
  assert(
    AUDIT_SKILL.includes('[CITED]') &&
      AUDIT_SKILL.includes('[VERIFIED]') &&
      AUDIT_SKILL.includes('[ASSUMED]'),
    'audit/SKILL.md references all three tags using exact bracket notation'
  );
}

// ---------------------------------------------------------------------------
// Command tests
// ---------------------------------------------------------------------------

console.log('\n\n=== Commands with inline finding-format hardcodes ===');

const CMDS_WITH_INLINE_FORMAT = ['quick.md', 'review-implementation.md', 'review.md'];

for (const cmd of CMDS_WITH_INLINE_FORMAT) {
  const p = path.join(COMMANDS_DIR, cmd);
  const content = readFile(p);
  console.log(`\nCommand: ${cmd}`);

  assert(content !== null, `${cmd} exists and is readable`);
  if (content === null) continue;

  assert(
    content.includes('Evidence Strength'),
    `${cmd} inline finding-format list includes "Evidence Strength"`
  );
  assert(
    content.includes('Citation'),
    `${cmd} inline finding-format list includes "Citation"`
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
process.exit(failed > 0 ? 1 : 0);
