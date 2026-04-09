#!/usr/bin/env node
// Test: bug-detector.md and pattern-reviewer.md contain stub/hollow implementation detection

const fs = require('fs');
const path = require('path');

const BUG_DETECTOR_PATH = path.join(__dirname, '..', '..', 'agents', 'bug-detector.md');
const PATTERN_REVIEWER_PATH = path.join(__dirname, '..', '..', 'agents', 'pattern-reviewer.md');

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

const bugDetector = fs.readFileSync(BUG_DETECTOR_PATH, 'utf8');
const patternReviewer = fs.readFileSync(PATTERN_REVIEWER_PATH, 'utf8');

// ============================================================
// BUG-DETECTOR TESTS
// ============================================================
console.log('=== Bug Detector Tests ===');

// Test 1: Section header
console.log('\nTest 1: Stub detection section header');
assert(
  bugDetector.includes('### Stub / Hollow Implementation Detection') ||
  (bugDetector.includes('Stub') && bugDetector.includes('Hollow Implementation')),
  'bug-detector.md contains stub/hollow implementation detection section'
);

// Test 2: Stub patterns present
console.log('\nTest 2: Stub patterns');
assert(
  bugDetector.includes('= []') && bugDetector.includes('= {}') && bugDetector.includes('= null'),
  'bug-detector.md contains "= []", "= {}", "= null" patterns'
);
assert(
  bugDetector.includes('TODO') && bugDetector.includes('FIXME') && bugDetector.includes('XXX'),
  'bug-detector.md contains "TODO", "FIXME", "XXX" patterns'
);

// Test 3: Placeholder pattern
console.log('\nTest 3: Placeholder pattern');
assert(
  bugDetector.includes('placeholder'),
  'bug-detector.md contains "placeholder" pattern'
);

// Test 4: Empty catch blocks
console.log('\nTest 4: Empty catch blocks');
assert(
  bugDetector.includes('catch') && (bugDetector.includes('empty') || bugDetector.includes('Empty')),
  'bug-detector.md mentions empty catch blocks pattern'
);

// Test 5: Test file exclusion
console.log('\nTest 5: Test file exclusion');
assert(
  bugDetector.includes('.test.') && bugDetector.includes('.spec.') && bugDetector.includes('__tests__/'),
  'bug-detector.md contains ".test.", ".spec.", "__tests__/" exclusion'
);

// Test 6: WARNING severity
console.log('\nTest 6: WARNING severity');
assert(
  bugDetector.includes('WARNING'),
  'bug-detector.md contains "WARNING" severity level'
);

// Test 7: Output format
console.log('\nTest 7: Output format');
assert(
  bugDetector.includes('### Warning (Stubs)'),
  'bug-detector.md contains "### Warning (Stubs)" output format'
);

// Test 8: Existing sections still present (regression)
console.log('\nTest 8: Existing sections regression');
assert(bugDetector.includes('### Logic Errors'), 'bug-detector.md still has "### Logic Errors"');
assert(bugDetector.includes('### Null/Undefined Handling'), 'bug-detector.md still has "### Null/Undefined Handling"');
assert(bugDetector.includes('### Race Conditions'), 'bug-detector.md still has "### Race Conditions"');
assert(bugDetector.includes('### Security'), 'bug-detector.md still has "### Security"');
assert(bugDetector.includes('### Data Integrity'), 'bug-detector.md still has "### Data Integrity"');
assert(bugDetector.includes('### Edge Cases'), 'bug-detector.md still has "### Edge Cases"');

// ============================================================
// PATTERN-REVIEWER TESTS
// ============================================================
console.log('\n=== Pattern Reviewer Tests ===');

// Test 9: Section header
console.log('\nTest 9: Stub detection section');
assert(
  (patternReviewer.includes('Stub') && patternReviewer.includes('Hollow')) ||
  (patternReviewer.includes('stub') && patternReviewer.includes('hollow')),
  'pattern-reviewer.md contains stub/hollow detection section'
);

// Test 10: Stub patterns present
console.log('\nTest 10: Stub patterns');
assert(
  patternReviewer.includes('TODO') && patternReviewer.includes('FIXME') &&
  patternReviewer.includes('= []') && patternReviewer.includes('= {}'),
  'pattern-reviewer.md contains "TODO", "FIXME", "= []", "= {}" patterns'
);

// Test 11: Test file exclusion
console.log('\nTest 11: Test file exclusion');
assert(
  patternReviewer.includes('.test.') && patternReviewer.includes('.spec.') && patternReviewer.includes('__tests__/'),
  'pattern-reviewer.md contains ".test.", ".spec.", "__tests__/" exclusion'
);

// Test 12: WARNING severity
console.log('\nTest 12: WARNING severity');
assert(
  patternReviewer.includes('WARNING'),
  'pattern-reviewer.md contains "WARNING" severity level'
);

// Test 13: Existing sections still present (regression)
console.log('\nTest 13: Existing sections regression');
assert(
  patternReviewer.includes('### Step 1: Read False Positives'),
  'pattern-reviewer.md still has "### Step 1: Read False Positives"'
);
assert(
  patternReviewer.includes('### Step 4: Find Similar Existing Code'),
  'pattern-reviewer.md still has "### Step 4: Find Similar Existing Code"'
);
assert(
  patternReviewer.includes('### Step 5: Extract Patterns'),
  'pattern-reviewer.md still has "### Step 5: Extract Patterns"'
);
assert(
  patternReviewer.includes('### Step 6: Compare'),
  'pattern-reviewer.md still has "### Step 6: Compare"'
);

// ============================================================
// Results
// ============================================================
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
process.exit(failed > 0 ? 1 : 0);
