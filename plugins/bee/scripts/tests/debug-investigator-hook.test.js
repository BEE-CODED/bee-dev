#!/usr/bin/env node
// Test: hooks.json has SubagentStop entry for debug-investigator with correct
// validation prompt (structured output, hypothesis count, no file modifications).

const fs = require('fs');
const path = require('path');

const HOOKS_PATH = path.join(
  __dirname, '..', '..', 'hooks', 'hooks.json'
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

// Read and parse hooks.json
let hooks;
try {
  const raw = fs.readFileSync(HOOKS_PATH, 'utf8');
  hooks = JSON.parse(raw);
} catch (e) {
  console.log('FAIL: hooks.json could not be read or parsed');
  console.log(`  Error: ${e.message}`);
  console.log(`\nResults: 0 passed, 1 failed out of 1 assertions`);
  process.exit(1);
}

// ============================================================
// Test 13: SubagentStop entry exists for debug-investigator
// ============================================================
console.log('Test 13: SubagentStop entry for debug-investigator');
const subagentStopEntries = hooks.hooks.SubagentStop || [];
const debugEntry = subagentStopEntries.find(
  e => e.matcher === '^debug-investigator$'
);
assert(
  debugEntry !== undefined,
  'SubagentStop has entry with matcher "^debug-investigator$"'
);

// ============================================================
// Test 14: Hook validates structured output, hypothesis count, no file modifications
// ============================================================
console.log('\nTest 14: Hook validation details');
if (debugEntry) {
  const hook = debugEntry.hooks[0];
  assert(
    hook.type === 'prompt',
    'Hook type is "prompt"'
  );
  assert(
    hook.timeout === 30,
    'Hook timeout is 30'
  );

  const prompt = hook.prompt.toLowerCase();
  assert(
    prompt.includes('root cause found'),
    'Prompt validates ROOT CAUSE FOUND signal'
  );
  assert(
    prompt.includes('checkpoint reached'),
    'Prompt validates CHECKPOINT REACHED signal'
  );
  assert(
    prompt.includes('investigation inconclusive'),
    'Prompt validates INVESTIGATION INCONCLUSIVE signal'
  );
  assert(
    prompt.includes('hypothesis') && prompt.includes('3'),
    'Prompt checks hypothesis count does not exceed 3'
  );
  assert(
    prompt.includes('file modification') || prompt.includes('no write') ||
    prompt.includes('no file') || (prompt.includes('write') && prompt.includes('edit')),
    'Prompt validates no file modifications (diagnostic only)'
  );
} else {
  // If entry not found, still count tests as failed
  for (let i = 0; i < 7; i++) {
    failed++;
    console.log('  FAIL: (skipped -- no debug-investigator entry found)');
  }
}

// ============================================================
// Results
// ============================================================
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
process.exit(failed > 0 ? 1 : 0);
