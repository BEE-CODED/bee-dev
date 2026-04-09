#!/usr/bin/env node
// Test: hooks.json has SubagentStop entry for integration-checker with correct
// validation prompt (structured report, file references, no modifications).

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
// Test 10: SubagentStop entry exists for integration-checker
// ============================================================
console.log('Test 10: SubagentStop entry for integration-checker');
const subagentStopEntries = hooks.hooks.SubagentStop || [];
const integrationEntry = subagentStopEntries.find(
  e => e.matcher === '^integration-checker$'
);
assert(
  integrationEntry !== undefined,
  'SubagentStop has entry with matcher "^integration-checker$"'
);

// ============================================================
// Test 11: Hook validates structured report, file references, no modifications
// ============================================================
console.log('\nTest 11: Hook validation details');
if (integrationEntry) {
  const hook = integrationEntry.hooks[0];
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
    prompt.includes('integration check complete') && prompt.includes('integration audit summary'),
    'Prompt validates BOTH report headings (AND logic)'
  );
  assert(
    prompt.includes('wiring summary') || prompt.includes('connected') || prompt.includes('orphaned'),
    'Prompt validates Wiring Summary section with counts'
  );
  assert(
    prompt.includes('health') && (prompt.includes('healthy') || prompt.includes('moderate') || prompt.includes('concerning') || prompt.includes('broken')),
    'Prompt validates overall integration health rating'
  );
  assert(
    prompt.includes('f-int') || prompt.includes('f-int-'),
    'Prompt validates F-INT-NNN finding format'
  );
  assert(
    prompt.includes('file reference') || prompt.includes('file:') || prompt.includes('file path'),
    'Prompt validates file references in findings'
  );
  assert(
    prompt.includes('no code modification') || prompt.includes('no modification') ||
    prompt.includes('read-only') || (prompt.includes('write') && prompt.includes('edit')),
    'Prompt validates no code modifications (read-only agent)'
  );
} else {
  // If entry not found, still count tests as failed
  for (let i = 0; i < 8; i++) {
    failed++;
    console.log('  FAIL: (skipped -- no integration-checker entry found)');
  }
}

// ============================================================
// Results
// ============================================================
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
process.exit(failed > 0 ? 1 : 0);
