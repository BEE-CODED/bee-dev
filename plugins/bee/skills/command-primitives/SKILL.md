---
name: command-primitives
description: Reusable building blocks (validation guards, gates, model selection, agent resolution, loops) referenced by bee commands to avoid duplication
---

# Command Primitives

Shared building blocks used by `/bee:*` commands. Commands reference these
sections by name (`See \`skills/command-primitives/SKILL.md\` <Section
Name>.`) and supply a short parameter list rather than re-inlining the prose.

Each section is self-contained: it states its inputs, behavior, and outputs
explicitly so a command can collapse the inline copy down to a short
reference.

## Validation Guards

Named guard building blocks. Commands compose by listing which guards apply,
in order. Each guard reads only the dynamic-context files already loaded by
the command's "Current State" header.

**Composition syntax used by commands:** `Apply: NOT_INITIALIZED, NO_SPEC`
(or any subset, in declared order). Stop immediately if any guard fails.

### Guard: NOT_INITIALIZED

The NOT_INITIALIZED guard fires when the dynamic context contains
`NOT_INITIALIZED` (`.bee/STATE.md` does not exist). Tell the user:
"BeeDev is not initialized. Run `/bee:init` first."
Do NOT proceed.

### Guard: NO_SPEC

Read `.bee/STATE.md` from the dynamic context. If Current Spec Status is
`NO_SPEC`, Current Spec Path shows `(none)`, no `spec.md` exists, or the
context contains `NO_SPEC`, tell the user:
"No spec found. Run `/bee:new-spec` first."
Do NOT proceed.

### Guard: NO_PHASES

If the dynamic context contains `NO_PHASES` (no `phases.md`), tell the user:
"No phases found. Run `/bee:new-spec` first to create a spec with phases."
Do NOT proceed.

### Guard: Spec Directory Exists

Read the Current Spec Path from STATE.md. Check that the spec directory
exists on disk via `test -d {spec-path}`. If missing, tell the user:
"Spec directory not found at `{spec-path}`. STATE.md may be stale."
Do NOT proceed.

### Guard: Phase Status (parameterized by `$ALLOWED_STATUSES`)

For commands that target a specific phase. `$ALLOWED_STATUSES` is a
comma-separated list (e.g. `"EXECUTED, REVIEWED"` for `/bee:review`).
Resolve the phase number from `--phase N` in `$ARGUMENTS` if present;
otherwise from the latest phase row matching `$ALLOWED_STATUSES`. If no
phase matches, tell the user the actionable next step (e.g. "No executed
phases waiting for review. Run `/bee:execute-phase N` first.") and do NOT
proceed.

### Guard: Phase Number Argument

Check `$ARGUMENTS` for a phase number. If missing/empty, prompt with the
correct usage (e.g. "Please provide a phase number: `/bee:plan-phase 1`")
and do NOT proceed. If the number exceeds the count in `phases.md`, tell
the user "Phase {N} does not exist. Your spec has {M} phases." and stop.

### Guard: Already Reviewing

If the detected phase Status is `REVIEWING`, warn the user the previous
review may be in progress and ask for explicit confirmation before
continuing.

### Guard: Already Planned

If the detected phase Plan column is `Yes`, warn before overwriting:
PLANNED → soft warning; EXECUTING+ → strong warning that progress may be
lost. Stop unless the user confirms.

## Auto-Mode Marker

Used by `/bee:ship`, `/bee:plan-all`, `/bee:autonomous` to flag an autonomous
run in progress so downstream commands (`/bee:plan-phase`, agent-team
decision logic) can detect auto-mode and enforce the one-team-per-run cap.

**Composition syntax used by commands:** `Apply: AUTO_MODE_MARKER` at Step 1
(after Validation Guards). The cleanup step is named in the command's exit
section (typically the final step + any error-exit branch).

### Setup (at command start)

If `agent_teams.status == "enabled"` in `.bee/config.json`:
- Write `.bee/.autonomous-run-active` with content `$(date -u +%Y-%m-%dT%H:%M:%SZ)\n`
  (single ISO-8601 timestamp line; useful only for debugging stuck markers).
- Downstream auto-mode detection uses **file existence** as the sole signal.
  No PID, no nonce, no content parsing — Bash tool invocations don't share
  shell PIDs across calls, so any identity scheme would always misfire.

If `agent_teams.status != "enabled"`: skip marker creation entirely (no-op).

### Cleanup (at command end — success AND every error-exit branch)

Always remove all three markers:
- `rm -f .bee/.autonomous-run-active`
- `rm -f .bee/.autonomous-team-spawned`
- `rm -f .bee/.autonomous-team-claimed`

The cleanup is unconditional: even if the markers were not created (e.g.,
agent_teams disabled), `rm -f` is a no-op on missing files.

### Detection (downstream consumer pattern)

Other commands check for auto-mode by file existence only:
```
if [ -e .bee/.autonomous-run-active ]; then
  # AUTO MODE: skip AskUserQuestion, follow autonomous policy
else
  # INTERACTIVE MODE: prompt the user
fi
```

There is no "own-session vs cross-session" distinction — commands trust the
marker's presence. If a stale marker remains from a crashed run, it persists
until the user runs another auto-command (which cleans up at end) or removes
it manually. The user-facing trade-off (occasional stale-marker cleanup) is
acceptable because the previous PID-based detection was always-broken
(every Bash tool call gets a fresh shell PID).

## Build & Test Gate (Interactive)

Used by `/bee:review`, `/bee:review-implementation`, and `/bee:quick`.
Runs builds and tests before review and PROMPTS the user via
`AskUserQuestion` on failure.

**Build check (automatic, per-stack):**
For each `stack` in `config.stacks`, scoped to its `path`:
1. Detect a `build` script in `{stack.path}/package.json` (and
   `composer.json` for PHP-based stacks).
2. If present, run it (Node: `cd {stack.path} && npm run build`; PHP: skip).
3. On failure: display "Build: {stack.name} FAILED" with output, then
   `AskUserQuestion(question: "Build failed for {stack.name}. How to
   proceed?", options: ["Fix build errors first", "Continue review
   anyway"])`. Act on the choice. On pass: display "Build: {stack.name}:
   OK". Missing script: "skipped (no build script)".

**Test check (user opt-in, per-stack):**
Ask `AskUserQuestion(question: "Run tests before review?", options:
["Yes", "No"])`. If Yes:
For each stack, resolve its test runner via the Stack/Linter/Test-Runner
Resolution rule. If `"none"`, display "Tests: {stack.name}: skipped (no
test runner configured)" and continue. Otherwise run the parallel-capable
command (`vitest`: `npx vitest run`; `jest`: `npx jest --maxWorkers=auto`;
`pest`: `./vendor/bin/pest --parallel`) scoped to `{stack.path}` with a
5-minute timeout. On pass: display the count. On fail:
`AskUserQuestion(question: "Tests failed for {stack.name} ({fail_count}
failures). How to proceed?", options: ["Fix test failures first",
"Continue review anyway"])`.

If No: display "Tests: skipped" and continue.

## Build & Test Gate (Autonomous)

Used by `/bee:ship`. Same checks as the Interactive variant but NEVER
prompts; failures are logged to STATE.md `## Decisions Log` as
`[Optimistic-continuation]` decisions and the pipeline continues.

**Build check (automatic, per-stack):** identical detection, no prompt.
On failure log:
- **[Optimistic-continuation]:** Build failed for {stack.name} -- continuing review anyway.
- **Why:** Build failure may be pre-existing or caused by incomplete phase; review can still catch code-level issues.
- **Alternative rejected:** Stopping ship execution -- autonomous operation requires continuing through non-blocking failures.

**Test check (automatic, per-stack -- no user prompt):** resolve the test
runner via the Stack/Linter/Test-Runner Resolution rule, run the same
parallel-capable command. On failure log:
- **[Optimistic-continuation]:** Tests failed for {stack.name} ({fail_count} failures) -- continuing review.
- **Why:** Test failures may relate to in-progress work; review can still identify additional code-level issues.
- **Alternative rejected:** Stopping ship execution -- autonomous pipeline continues through recoverable failures.

## Context Cache + Dependency Scan

Read-once context shared across every review agent in the gate, plus an
optional dependency expansion of the file scope.

**Context Cache (read once, pass to all agents):**
Before spawning any agents, read these files once and include their content
verbatim in every agent's context packet -- agents must NOT re-read them:
1. Stack skill: `skills/stacks/{stack}/SKILL.md`
2. Project context: `.bee/CONTEXT.md`
3. False positives: `.bee/false-positives.md`
4. User preferences: `.bee/user.md`

**Dependency Scan (skip when no modified-file scope exists):**
1. For each modified file, grep for `import`/`require`/`use` statements to
   find its **dependencies** (files it imports).
2. Grep the project for files that `import`/`require` any modified file to
   find its **consumers** (files that import it).
3. Direct imports only (not transitive).
4. **Test file discovery:** look for `{name}.test.{ext}`, `{name}.spec.{ext}`,
   `tests/{name}.{ext}`, `__tests__/{name}.{ext}`.
5. Limit: max 20 extra files (deps + consumers + tests) per agent context;
   prioritize consumers over dependencies if over the cap.
6. Include all expanded paths alongside the modified files in the agent
   context packet, with the instruction: "Also verify that modifications
   don't break consumer files. Check import compatibility, return type
   changes, and side effect changes. Verify test files cover the modified
   behavior."

## Stack/Linter/Test-Runner Resolution

Standard fallback chain used wherever a command needs a per-stack linter or
test runner.

**Inputs:** `config.stacks[i]` (the stack entry) and root `config`.

**Linter:** `stacks[i].linter ?? config.linter ?? "none"`.
**Test runner:** `stacks[i].testRunner ?? config.testRunner ?? "none"`.

When `"none"`, skip the run for that stack with the message
`"{linter|tests}: {stack.name}: skipped (no {linter|test runner} configured)"`.

**Path-overlap matching:** when a command needs to map an arbitrary file
path to a stack entry, compare the file path against each stack's `path`. A
file matches a stack if the file path starts with (or is within) the
stack's `path`. A stack with `path` set to `"."` matches everything.

**Single-stack fast path:** if `config.stacks` has exactly one entry,
resolve directly against it and skip path-overlap logic.

**v2 backward compatibility:** if `config.stacks` is absent but
`config.stack` is set, treat it as a single-entry list:
`[{ name: config.stack, path: "." }]`.

## Model Selection (Reasoning)

Standard rule for implementer / reviewer / validator / fixer agents (any
agent doing reasoning-heavy work).

**Inputs:** `$IMPLEMENTATION_MODE` from `config.implementation_mode`
(default: `"premium"`).

**Rule:**
- `"economy"` → pass `model: "sonnet"`
- `"quality"` or `"premium"` → omit the `model` parameter (agent inherits the
  parent model)

**Fixer exception:** fixers always omit the `model` parameter regardless of
mode -- production-code writing always uses the parent model.

## Model Selection (Scanning)

Researcher variant -- scanning work is cheaper than reasoning.

**Inputs:** `$IMPLEMENTATION_MODE` from `config.implementation_mode`.

**Rule:**
- `"economy"` or `"quality"` → pass `model: "sonnet"`
- `"premium"` → omit the `model` parameter (inherit parent model)

This differs from the Reasoning rule because `"quality"` mode keeps
researchers on sonnet while elevating reasoning agents.

## Per-Stack Agent Resolution

For each per-stack agent role (e.g. `bug-detector`, `pattern-reviewer`,
`stack-reviewer`, `implementer`), check whether a stack-specific variant
exists at `agents/stacks/{stack.name}/{role}.md`. If yes, use
`{stack.name}-{role}` as the `subagent_type`. If no, fall back to the
generic `bee:{role}`.

Generic agents remain the default for any stack without a dedicated
variant in `agents/stacks/{stack.name}/`.

## Auto-Fix Loop (Autonomous)

Used by `/bee:plan-all` and `/bee:ship`. Iterate review-then-fix without
user interaction.

**Inputs:**
- `$MAX_ITERATIONS_KEY`: which `config.*.max_*_iterations` to read (e.g.
  `ship.max_review_iterations`, default `3`).
- `$STYLISTIC_POLICY`: how STYLISTIC findings are handled (autonomous
  pipelines auto-fix them; interactive ones prompt -- see Re-Review Loop).

**Algorithm:**
1. Initialize `$ITERATION = 1`. Read the configured maximum into
   `$MAX_ITERATIONS`.
2. Run the review pipeline (agents → consolidate → write report).
3. If 0 issues: log "clean", exit the loop.
4. Apply fixes directly to the relevant files. Log a Decisions Log entry of
   the form `[Plan review auto-fix]` / `[Auto-fix]` (whichever the command
   uses) describing what/why/alternative-rejected.
5. If `$ITERATION >= $MAX_ITERATIONS`: log a `[Optimistic-continuation]`
   decision noting unresolved findings and exit.
6. Increment `$ITERATION` and go to step 2.

## Re-Review Loop (Interactive)

Used by `/bee:review` and `/bee:quick`. Opt-in via flag (`--loop`) or
config (`review.loop`). No max-iterations cap by default -- the user
decides when clean via the post-fix `AskUserQuestion` menu.

**STYLISTIC handling:** prompt the user per finding via `AskUserQuestion`
with options `["Fix it", "Ignore", "False Positive"]`.

**Loop-cap exception (review only):** if `--loop`/`config.review.loop` is
set, `config.review.max_loop_iterations` (default `3`) caps automatic
re-review iterations; the user can still re-run the command manually to
continue.

**Algorithm:**
1. Run the review pipeline once.
2. Validate, fix confirmed issues.
3. Present the post-fix menu (`AskUserQuestion(["Re-review", "Accept",
   "Custom"])`).
4. On "Re-review": archive the previous report as `REVIEW-{N}.md`, increment
   the cumulative iteration counter, re-run the agents, repeat.
5. On "Accept": exit the loop.
