---
name: core
description: BeeDev workflow rules -- TDD mandatory, disk-is-truth, no auto-commit. Spec-driven development with phase lifecycle.
---

# Core Workflow Knowledge

## Workflow Rules

These rules apply to ALL work within a Bee-managed project. No exceptions.

### TDD is mandatory

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? **Delete it. Start over.**
- Don't keep it as "reference"
- Don't "adapt" it while writing tests
- Don't look at it
- Delete means delete

**The Red-Green-Refactor cycle:**
1. **Red:** Write a failing test. Run it. Watch it FAIL. Verify the failure is about missing implementation, not test logic errors.
2. **Green:** Write the MINIMAL code to make the test pass. Nothing extra.
3. **Refactor:** Clean up with passing tests as safety net. Tests must pass after every change.

**Watch It Fail (MANDATORY):**
After writing a test, run it and confirm:
- Test FAILS (not errors — actual assertion failure)
- Failure message matches expected behavior
- Fails because feature is missing, not because of typos

Test passes immediately? You're testing existing behavior. Fix the test.

**Verification before completion:**
Before claiming work is done, verify with fresh evidence:
- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Tests fail for expected reason
- [ ] Wrote minimal code to pass
- [ ] All tests pass (fresh run, not cached)
- [ ] Output is clean (no errors, no warnings)
- [ ] Tests use real code (mocks only when unavoidable)
- [ ] Edge cases and error paths covered

**Testing anti-patterns (avoid these):**
- Testing mock behavior instead of real behavior — assert on what the code DOES, not what mocks return
- Test-only methods in production classes — move cleanup/reset to test utilities
- Mocking without understanding dependencies — know what side effects you're replacing
- Incomplete mocks with partial data — mirror real data structures completely
- Tests added after implementation — tests-after prove nothing; they pass immediately

**Common rationalizations (all wrong):**

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests-after pass immediately and prove nothing. |
| "Already manually tested" | Manual testing is not systematic and cannot be re-run. |
| "Deleting my code is wasteful" | Sunk cost fallacy. Unverified code is technical debt. |
| "Keep code as reference" | You'll adapt it. That's testing-after in disguise. |
| "Need to explore first" | Fine. Throw away exploration, then start with TDD. |
| "Hard to test = skip test" | Hard to test = hard to use. Listen to the test. |
| "TDD will slow me down" | TDD is faster than debugging. Always. |
| "Existing code has no tests" | You're improving it. Start with tests for your changes. |

**Red flags — STOP and start over:**
- Code written before test
- Test passes immediately (no red phase)
- Can't explain why test failed
- "Just this once" rationalization
- "I already manually tested it"
- "Tests after achieve the same purpose"
- "This is different because..."

All of these mean: delete code, start over with TDD.

### Disk is truth
All critical state lives on disk. Never rely on conversation memory.
- `STATE.md` tracks current spec, phase progress, decisions, and last action
- `TASKS.md` is the execution contract -- tasks, waves, research notes, agent notes, completion status
- `config.json` holds project configuration (stacks with per-stack linter and test runner, CI, review settings)

- `memory/` directory holds per-agent persistent knowledge (see Agent memory system below)

If it is not on disk, it does not exist.

### No auto-commit
The user decides when and what to commit via `/bee:commit`. Never commit automatically. Never stage files without explicit user instruction through the commit command.

### User stays in control
- Never make forced decisions -- always confirm before destructive actions
- Present options and let the user choose
- Show what will change before making changes

### Smart model delegation
When spawning agents via the Task tool, the conductor (parent command) chooses the model based on the agent's work complexity. All agents use `model: inherit` in their frontmatter -- the conductor overrides at spawn time.

**Model selection guide:**

| Model | When to use | Examples |
|-------|-------------|---------|
| `model: "sonnet"` | Structured/template work, scanning, classification, validation, comparison | researcher, spec-writer, phase-planner, plan-reviewer, finding-validator, integrity-auditor, test-auditor, test-planner, reviewer (ad-hoc mode — focused scope scan) |
| (omit / inherit) | Production code, complex reasoning, deep analysis, interactive sessions | implementer, fixer, reviewer (full phase review — deep multi-category analysis), spec-shaper |

**Decision principle:** If the agent follows a template, does read-only scanning, runs tools mechanically, or classifies into fixed categories -- pass `model: "sonnet"`. If the agent writes production code, makes architectural decisions, or needs deep nuanced analysis -- omit the model parameter (inherits parent model).

The conductor SHOULD assess each spawn and pass `model: "sonnet"` explicitly for structured work, or omit the model for reasoning-heavy work. This is not optional -- it is how Bee manages cost and speed.

### Agent memory system
Agents have persistent per-project memory stored in `.bee/memory/`. This is NOT loaded into the main context -- only agents load their own memory when spawned.

- `shared.md` -- cross-cutting knowledge all agents read
- `{agent-name}.md` -- per-agent knowledge (only that agent reads/writes it)

**Memory injection:** The SubagentStart hook (`scripts/inject-memory.sh`) automatically reads `shared.md` and `{agent-name}.md` and injects the content into the agent's context at spawn time. Agents do NOT need to read memory files manually. If no memory appears in context, the project has no accumulated knowledge yet -- fallback: read `.bee/memory/shared.md` and `.bee/memory/{agent-name}.md` manually.

**Rules for agents writing memory:**
- Append new learnings, never rewrite the entire file
- One entry per line: `- [{YYYY-MM-DD}] description`
- No duplicates -- check existing entries before appending
- Max 50 lines per file -- consolidate older entries when approaching the limit
- Only write genuinely useful project knowledge, not task-specific details
- Write-capable agents write memory automatically; read-only agents consume only

**The golden rule:** Write ONLY things you cannot discover by reading the codebase. If a `grep` or `Read` tool call would find it, do NOT write it to memory.

**What belongs in memory:**
- User decisions and preferences ("user prefers 3-phase structure", "Dogecoin is permanently out of scope")
- Non-obvious project constraints ("source at repo root, node_modules copy is a mirror -- edit root only")
- Gotchas that wasted significant time and have no code-level signal
- Environment quirks that block execution ("no native test runner, verify via JS integration tests only")

**What does NOT belong in memory:**
- File paths, API signatures, class structures -- agents find these in seconds via Grep/Read
- Code patterns visible from reading the source ("uses static methods", "fields cast as X")
- Task-specific implementation details
- Anything already in STATE.md, config.json, TASKS.md, or stack skills
- Generic framework knowledge (use Context7 for that)

**Shared memory (`shared.md`):** Reserved for cross-cutting knowledge that benefits ALL agents. Only spec-shaper and spec-writer write to shared.md -- they capture user decisions and scope boundaries from the discovery conversation. Other agents write only to their own file.

**Memory lifecycle across specs:** When `/bee:new-spec` creates a new spec, it archives the previous spec's memory to `.bee/memory-archive/{spec-name}/`. Only project-level shared entries survive (patterns, conventions, preferences). Agent-specific memory resets so agents start clean for the new feature.

### Spec-driven development
Work only on features and tasks defined in specs. No ad-hoc implementation.
- Specs define WHAT to build (behavior, acceptance criteria)
- Phase plans define HOW to build it (tasks, waves, dependencies)
- Implementation follows the plan, not improvisation

### Phase lifecycle
Every feature follows this lifecycle:

| Step | Command | Output |
|------|---------|--------|
| Plan What | `/bee:new-spec` | Spec document with requirements |
| Plan How | `/bee:plan-phase` | TASKS.md with waves and tasks |
| Do | `/bee:execute-phase` | Implementation with TDD |
| Check | `/bee:review` | Review findings, validated fixes |
| Test | `/bee:test` | Manual test verification |
| Commit | `/bee:commit` | Clean, reviewed commit |

Phases must be reviewed before advancing to the next phase (`phases.require_review_before_next` in config).

## File Format References

- **TASKS.md:** Execution contract for each phase. See [templates/tasks.md](templates/tasks.md)
- **STATE.md:** Project state tracking. See [templates/state.md](templates/state.md)
- **config.json:** Project configuration. See [templates/project-config.json](templates/project-config.json)
- **Wave conventions:** Wave 1 = no dependencies (parallel). Wave N+1 depends on Wave N. No file conflicts within a wave.
