#!/usr/bin/env node
// Test: complete-spec.md command file has correct frontmatter, dynamic context,
// all required steps (guards, pre-check, audit inline, changelog, git tag,
// archive, spec history, STATE.md reset + version bump, summary), and follows
// command conventions.

const fs = require('fs');
const path = require('path');

const CMD_PATH = path.join(
  __dirname, '..', '..', 'commands', 'complete-spec.md'
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

// Helper: extract content between a section heading and the next heading of same or higher level
function contentBetweenSections(sectionHeading, fullContent) {
  const startIdx = fullContent.indexOf(sectionHeading);
  if (startIdx === -1) return '';
  const afterHeading = fullContent.substring(startIdx + sectionHeading.length);
  const headingLevel = sectionHeading.match(/^#+/);
  if (!headingLevel) return afterHeading;
  const level = headingLevel[0].length;
  const regex = new RegExp(`\n#{1,${level}} [^#]`);
  const nextSection = afterHeading.search(regex);
  if (nextSection === -1) return afterHeading;
  return afterHeading.substring(0, nextSection);
}

// Read the file
let content;
try {
  content = fs.readFileSync(CMD_PATH, 'utf8');
} catch (e) {
  console.log('FAIL: complete-spec.md does not exist at expected path');
  console.log(`  Expected: ${CMD_PATH}`);
  console.log(`\nResults: 0 passed, 1 failed out of 1 assertions`);
  process.exit(1);
}

// ============================================================
// Test 1: Frontmatter (3 assertions)
// ============================================================
console.log('Test 1: Frontmatter');
assert(
  content.startsWith('---'),
  'File starts with YAML frontmatter delimiter'
);
assert(
  content.includes('description:') &&
  (content.toLowerCase().includes('lifecycle') || content.toLowerCase().includes('ceremony')),
  'Frontmatter has description with "lifecycle" or "ceremony" keyword'
);
assert(
  content.includes('argument-hint:') &&
  content.includes('--skip-audit') &&
  content.includes('--skip-tag'),
  'Frontmatter has argument-hint with --skip-audit and --skip-tag'
);

// ============================================================
// Test 2: Guard tests (3 assertions)
// ============================================================
console.log('\nTest 2: Validation guards');
const step1Content = contentBetweenSections('### Step 1', content);
assert(
  step1Content.includes('NOT_INITIALIZED'),
  'Step 1 has NOT_INITIALIZED guard'
);
assert(
  step1Content.includes('NO_SPEC'),
  'Step 1 has NO_SPEC guard'
);
assert(
  step1Content.toLowerCase().includes('test -d') ||
  step1Content.toLowerCase().includes('spec directory') ||
  step1Content.toLowerCase().includes('directory exists') ||
  step1Content.toLowerCase().includes('directory does not exist'),
  'Step 1 has spec directory guard'
);

// ============================================================
// Test 3: Step 3 audit tests (4 assertions)
// ============================================================
console.log('\nTest 3: Step 3 - Inline audit');
const step3Content = contentBetweenSections('### Step 3', content);
assert(
  step3Content.toLowerCase().includes('traceability') ||
  step3Content.toLowerCase().includes('audit'),
  'Step 3 contains inline audit logic (traceability/audit references)'
);
assert(
  step3Content.includes('--skip-audit'),
  'Step 3 handles --skip-audit flag'
);
assert(
  step3Content.includes('lifecycle.require_audit_before_complete'),
  'Step 3 checks lifecycle.require_audit_before_complete config'
);
assert(
  step3Content.toLowerCase().includes('coverage') &&
  (step3Content.includes('Proceed') || step3Content.includes('Cancel')),
  'Step 3 has coverage percentage check with proceed/cancel option'
);

// ============================================================
// Test 4: Step 4 changelog tests (3 assertions)
// ============================================================
console.log('\nTest 4: Step 4 - Changelog generation');
const step4Content = contentBetweenSections('### Step 4', content);
assert(
  step4Content.includes('CHANGELOG'),
  'Step 4 contains CHANGELOG generation section'
);
assert(
  step4Content.includes('Added') &&
  step4Content.includes('Changed') &&
  step4Content.includes('Fixed'),
  'Step 4 contains Added/Changed/Fixed categories'
);
assert(
  step4Content.toLowerCase().includes('files changed') ||
  (step4Content.toLowerCase().includes('lines added') && step4Content.toLowerCase().includes('lines removed')) ||
  step4Content.toLowerCase().includes('git diff --stat') ||
  step4Content.toLowerCase().includes('git stats'),
  'Step 4 contains git stats (files changed, lines)'
);

// ============================================================
// Test 5: Step 5 git tag tests (3 assertions)
// ============================================================
console.log('\nTest 5: Step 5 - Git tag');
const step5Content = contentBetweenSections('### Step 5', content);
assert(
  step5Content.includes('git tag -a'),
  'Step 5 contains git tag -a command'
);
assert(
  step5Content.includes('--skip-tag'),
  'Step 5 handles --skip-tag flag'
);
assert(
  step5Content.includes('lifecycle.tag_format') ||
  step5Content.includes('spec/{slug}'),
  'Step 5 contains configurable tag format (lifecycle.tag_format or spec/{slug})'
);

// ============================================================
// Test 6: Steps 6-7 archive + history tests (3 assertions)
// ============================================================
console.log('\nTest 6: Steps 6-7 - Archive + history');
const step6Content = contentBetweenSections('### Step 6', content);
assert(
  step6Content.includes('.bee/archive/') &&
  (step6Content.toLowerCase().includes('mv') || step6Content.toLowerCase().includes('move')),
  'Step 6 contains archive move (mv to .bee/archive/)'
);
const step7Content = contentBetweenSections('### Step 7', content);
assert(
  step7Content.includes('SPEC-HISTORY.md'),
  'Step 7 contains SPEC-HISTORY.md creation/update'
);
assert(
  step7Content.includes('.bee/history/'),
  'Step 7 references .bee/history/ directory'
);

// ============================================================
// Test 7: Step 8 STATE.md reset tests (2 assertions)
// ============================================================
console.log('\nTest 7: Step 8 - STATE.md reset');
const step8Content = contentBetweenSections('### Step 8', content);
assert(
  step8Content.includes('ARCHIVED'),
  'Step 8 sets ARCHIVED status'
);
assert(
  step8Content.includes('NO_SPEC'),
  'Step 8 sets NO_SPEC status (double-write)'
);

// ============================================================
// Test 8: UX + design tests (3 assertions)
// ============================================================
console.log('\nTest 8: UX + design');
const askCount = (content.match(/AskUserQuestion/g) || []).length;
assert(
  askCount >= 3,
  `Contains at least 3 AskUserQuestion calls (found ${askCount})`
);
assert(
  content.includes('Design Notes'),
  'Contains "Design Notes" section'
);
assert(
  !content.includes('Task(') ||
  content.includes('No `Task(`') ||
  content.includes('not delegated'),
  'Does NOT use agent spawning (no Task( pattern)'
);

// ============================================================
// Test 9: Additional ceremony coverage (3 bonus assertions)
// ============================================================
console.log('\nTest 9: Additional ceremony coverage');
assert(
  content.includes('plugin.json') &&
  (step8Content.toLowerCase().includes('patch') || step8Content.toLowerCase().includes('increment') || step8Content.toLowerCase().includes('version')),
  'Step 8 includes plugin version bump'
);
assert(
  content.includes('spec/{slug}'),
  'Tag format default includes spec/{slug} pattern'
);
assert(
  content.toLowerCase().includes('never auto-commit') ||
  content.toLowerCase().includes('does not commit') ||
  content.toLowerCase().includes('not commit anything') ||
  content.toLowerCase().includes('never commits'),
  'Command explicitly states it never auto-commits'
);

// ============================================================
// Results
// ============================================================
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
process.exit(failed > 0 ? 1 : 0);
