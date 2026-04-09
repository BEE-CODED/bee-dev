#!/usr/bin/env node
// Test: hooks.json has SubagentStop entry for testing-auditor with dual-mode
// validation (scan mode + generate mode).

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
  const hooksContent = fs.readFileSync(HOOKS_PATH, 'utf8');
  hooks = JSON.parse(hooksContent);
} catch (e) {
  console.log('FAIL: hooks.json could not be read or parsed');
  process.exit(1);
}

// ============================================================
// Test 12: SubagentStop entry for testing-auditor exists
// ============================================================
console.log('\nTest 12: testing-auditor SubagentStop entry exists');
const subagentStopHooks = hooks.hooks.SubagentStop;
const testingAuditorEntry = subagentStopHooks.find(
  entry => entry.matcher === '^testing-auditor$'
);
assert(
  !!testingAuditorEntry,
  'hooks.json has SubagentStop entry with matcher "^testing-auditor$"'
);

// ============================================================
// Test 13: Hook validates dual-mode (scan + generate)
// ============================================================
console.log('\nTest 13: Hook dual-mode validation');
if (testingAuditorEntry) {
  const hook = testingAuditorEntry.hooks[0];
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
    prompt.includes('scan mode') && prompt.includes('generate mode'),
    'Prompt validates BOTH scan mode and generate mode'
  );
  assert(
    prompt.includes('testing audit summary'),
    'Prompt uses "Testing Audit Summary" as scan mode signal'
  );
  assert(
    prompt.includes('test generation summary'),
    'Prompt uses "Test Generation Summary" as generate mode signal'
  );
  assert(
    prompt.includes('f-test'),
    'Prompt validates F-TEST finding format'
  );
  assert(
    prompt.includes('requirement coverage map'),
    'Prompt validates Requirement Coverage Map in generate mode'
  );
  assert(
    prompt.includes('no code modification') || prompt.includes('read-only') ||
    (prompt.includes('not') && prompt.includes('written')),
    'Prompt validates read-only constraint in scan mode'
  );
  assert(
    prompt.includes('test file') && (prompt.includes('created') || prompt.includes('modified')),
    'Prompt validates only test files written in generate mode'
  );
  assert(
    prompt.includes('exactly one mode'),
    'Prompt requires exactly one mode detected'
  );
} else {
  for (let i = 0; i < 10; i++) {
    failed++;
    console.log('  FAIL: (skipped -- no testing-auditor entry found)');
  }
}

// ============================================================
// Results
// ============================================================
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
process.exit(failed > 0 ? 1 : 0);
