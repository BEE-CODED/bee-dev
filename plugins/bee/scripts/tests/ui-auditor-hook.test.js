#!/usr/bin/env node
// Test: hooks.json has SubagentStop entry for ui-auditor with correct
// validation prompt (6 pillars present, scores 1-4, evidence per pillar, read-only constraint).

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
// Test 12: SubagentStop entry exists for ui-auditor
// ============================================================
console.log('Test 12: SubagentStop entry for ui-auditor');
const subagentStopEntries = hooks.hooks.SubagentStop || [];
const uiAuditorEntry = subagentStopEntries.find(
  e => e.matcher === '^ui-auditor$'
);
assert(
  uiAuditorEntry !== undefined,
  'SubagentStop has entry with matcher "^ui-auditor$"'
);

// ============================================================
// Test 13: Hook validates 6 pillars, scores, evidence, read-only
// ============================================================
console.log('\nTest 13: Hook validation details');
if (uiAuditorEntry) {
  const hook = uiAuditorEntry.hooks[0];
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
    prompt.includes('design system') || prompt.includes('design'),
    'Prompt validates Design System pillar'
  );
  assert(
    prompt.includes('accessibility'),
    'Prompt validates Accessibility pillar'
  );
  assert(
    prompt.includes('performance'),
    'Prompt validates Performance pillar'
  );
  assert(
    prompt.includes('responsiveness') || prompt.includes('responsive'),
    'Prompt validates Responsiveness pillar'
  );
  assert(
    prompt.includes('interaction'),
    'Prompt validates Interaction Quality pillar'
  );
  assert(
    prompt.includes('polish'),
    'Prompt validates Polish pillar'
  );
  assert(
    prompt.includes('6 pillar') || prompt.includes('six pillar') ||
    (prompt.includes('design') && prompt.includes('accessibility') && prompt.includes('performance') &&
     prompt.includes('responsiveness') && prompt.includes('interaction') && prompt.includes('polish')),
    'Prompt validates all 6 pillars present'
  );
  assert(
    prompt.includes('1-4') || prompt.includes('score') || prompt.includes('1 to 4'),
    'Prompt validates scores in 1-4 range'
  );
  assert(
    prompt.includes('evidence') || prompt.includes('file reference') || prompt.includes('file:line'),
    'Prompt validates evidence per pillar'
  );
  assert(
    prompt.includes('priority fix') || prompt.includes('top 3'),
    'Prompt validates Top 3 Priority Fixes section'
  );
  assert(
    prompt.includes('ui-review.md') && prompt.includes('written'),
    'Prompt validates UI-REVIEW.md was written'
  );
  assert(
    prompt.includes('ui review complete'),
    'Prompt validates completion heading (## UI REVIEW COMPLETE)'
  );
  assert(
    prompt.includes('no code modification') || prompt.includes('read-only') ||
    prompt.includes('no production code') || (prompt.includes('write') && prompt.includes('other than')),
    'Prompt validates read-only constraint (only UI-REVIEW.md write allowed)'
  );
} else {
  // If entry not found, still count tests as failed
  for (let i = 0; i < 15; i++) {
    failed++;
    console.log('  FAIL: (skipped -- no ui-auditor entry found)');
  }
}

// ============================================================
// Results
// ============================================================
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
process.exit(failed > 0 ? 1 : 0);
