---
description: Multi-agent parallel review with segmentation, consensus scoring, and evidence chains -- dispatches specialized reviewers per code segment
argument-hint: "[path] [--phase N] [--cross-phase N-M] [--pre-commit] [--only bug-detector,security,...] [--skip-validation] [--severity critical,high]"
---

## Current State (load before proceeding)

Read these files using the Read tool:
- `.bee/STATE.md` -- if not found: check for ad-hoc/external invocation (Step 1 handles this)
- `.bee/config.json` -- if not found: use `{}`

## Instructions

You are running `/bee:swarm-review` -- the intelligent multi-agent swarm review pipeline for BeeDev. Unlike `/bee:review` (4 fixed agents on phase files) or `/bee:audit` (10 agents on entire codebase), swarm-review is intelligent: it segments code first, then dispatches ONLY the most relevant agents per segment. This produces deeper, more focused review with less noise.

### Step 1: Current State and Invocation Path Detection

Read these files using the Read tool:
- `.bee/STATE.md` -- if not found: check for ad-hoc/external invocation
- `.bee/config.json` -- if not found: use `{}`

Detect invocation path from `$ARGUMENTS`:

1. **`--pre-commit` path:** Review staged changes only. Run `git diff --cached --name-only` to get files. No `.bee/` required. Filter to source files only (exclude lock files, generated files, `.bee/` directory files).

2. **`--phase N` path (post-phase):** Review a specific phase's files. Requires `.bee/STATE.md` with the phase in EXECUTED+ status. Read TASKS.md for the phase to identify files created/modified. If phase not found or not in EXECUTED+ status, tell user and stop. **Empty file guard:** After extracting the file list from TASKS.md, filter to source files only. If the resulting list is empty, display: "Phase {N} has no source files in TASKS.md. Nothing to review." and stop.

3. **`--cross-phase N-M` path:** Review files across phases N through M. Requires `.bee/STATE.md`. Collect all files from TASKS.md for each phase in the range. Phases must exist and have EXECUTED+ status.

4. **Explicit path argument (ad-hoc/external):** If first argument is a path (not a flag), review files at that path. If path is outside project root, treat as external repo. Do NOT require `.bee/` for external repos. Use Glob to discover source files at the target path.

5. **Post-implementation (default with .bee/):** If `.bee/STATE.md` exists and no explicit flags, find the last phase with EXECUTED+ status. Review all files from that phase's TASKS.md. Falls back to git diff if no executed phases.

6. **Ad-hoc (default without .bee/):** If no `.bee/STATE.md`, use `git diff --stat` + `git diff --cached --stat` + `git status --short` to find changed files. Filter to source files only. If no changes, ask user for a path. Do NOT require `.bee/` initialization.

For external repos (path outside project or `--external` flag):
- Do NOT require `.bee/` directory
- Use the target directory's own config files if present
- Auto-detect stack from package.json/composer.json at the target path
- Write output to `{target_path}/SWARM-REVIEW.md`

Display detected path:
```
Invocation: {path type} ({N} files in scope)
```

### Step 2: Parse Arguments

Check `$ARGUMENTS` for flags:

1. **`--only` flag:** Comma-separated list of agents to dispatch. Valid values: `bug-detector`, `pattern-reviewer`, `stack-reviewer`, `security-auditor`, `error-handling-auditor`, `performance-auditor`, `architecture-auditor`, `database-auditor`, `frontend-auditor`, `integration-checker`. If present, only dispatch specified agents per segment (overrides auto-detection). If absent, use agent relevance mapping (Step 5).

2. **`--skip-validation` flag:** Skip finding-validator step (Step 8). Findings go directly to output as UNVALIDATED. Useful for speed when you trust the results and plan to manually review.

3. **`--severity` flag:** Comma-separated severity filter for the final report. Valid values: `critical`, `high`, `medium`. If present, only include findings of the specified severities in the output. If absent, include all severities.

4. **`--segment` flag:** Force segmentation strategy. Valid values: `file`, `component`, `layer`. Overrides auto-detection in Step 4.

### Step 3: Detect Stack and Build Context Cache

Read `.bee/config.json` (or auto-detect from manifest files for external repos):

**Stack Resolution:**
- Read `config.stacks` array first
- Fall back to `config.stack` (legacy v2 compatibility): `[{name: config.stack, path: "."}]`
- Fall back to auto-detect from package.json/composer.json at project root or target path
- If no stack detected, proceed without stack-specific agents

Read `config.implementation_mode` and store as `$IMPLEMENTATION_MODE`. If not set, defaults to `"premium"`.

**Context Cache (read once, pass to all agents):**

Before spawning any agents, read these files once and include their content in every agent's context packet:
1. Stack skill: `plugins/bee/skills/stacks/{stack}/SKILL.md` (if exists)
2. Project context: `.bee/CONTEXT.md` (if exists)
3. False positives: `.bee/false-positives.md` (if exists -- extract as formatted exclusion list)
4. User preferences: `.bee/user.md` (if exists)
5. CLAUDE.md at project root (if exists)

Pass these as part of the agent's prompt context -- agents should NOT re-read these files themselves.

For external repos without `.bee/`, only load stack skill (auto-detected) and CLAUDE.md. Do NOT require `.bee/` for context loading -- gracefully skip any missing files.

**Dependency Scan:**

For each file in scope, expand to include direct dependencies and consumers:
1. For each file, grep for `import`/`require`/`use` statements to find its **dependencies** (files it imports)
2. Grep the project for files that `import`/`require` any scoped file to find its **consumers** (files that import it)
3. Scan depth: direct imports only (not transitive)
4. **Test file discovery:** For each file, look for corresponding test files using common patterns: `{name}.test.{ext}`, `{name}.spec.{ext}`, `tests/{name}.{ext}`, `__tests__/{name}.{ext}`
5. Limit: max 20 extra files (dependencies + consumers + test files combined) per segment
6. Include all expanded file paths in the agent's context packet alongside the segment files

### Step 4: Segmentation

Segment the files in scope into logical review chunks. Use auto-detection with three strategies (or force via `--segment` flag):

**Strategy 1: Per-Layer (default for 10+ files)**

Group files by architectural layer:
- Controllers/Routes/Pages (entry points)
- Services/Actions/Handlers (business logic)
- Models/Entities/Types (data layer)
- Components/Views (UI layer)
- Middleware/Guards/Policies (cross-cutting)
- Config/Migrations/Scripts (infrastructure)
- Tests (test layer -- reviewed for quality but NOT for bugs in tests themselves)

Detection: Use directory structure conventions per stack. For Laravel: `app/Http/Controllers/` = Controllers, `app/Models/` = Models, `app/Services/` = Services. For React/Next: `components/` = UI, `pages/` or `app/` = Pages, `lib/` or `utils/` = Services. For generic: parse directory names and import patterns.

**Strategy 2: Per-Component (default for 5-9 files)**

Group files that form a logical feature unit: a component + its model + its API route + its tests. Detection: trace import/require chains to find clusters. Files that share more than 2 import connections belong to the same component cluster.

**Strategy 3: Per-File (default for 1-4 files or --pre-commit)**

Each file is its own segment. Simple and effective for small review scopes.

Override: User can force a strategy via `--segment file|component|layer`.

Display segmentation to user:
```
Segmentation: {strategy} ({N} segments)
  Segment 1: {name} ({count} files)
  Segment 2: {name} ({count} files)
  ...
```

### Step 5: Agent Relevance Mapping

For each segment, determine which review agents are MOST relevant:

| Segment Type | Primary Agents | Secondary Agents |
|-------------|---------------|-----------------|
| Controllers/Routes/Pages | bug-detector, security-auditor, api-auditor | error-handling-auditor |
| Services/Business Logic | bug-detector, architecture-auditor, performance-auditor | error-handling-auditor |
| Models/Data Layer | database-auditor, bug-detector | security-auditor |
| UI Components | frontend-auditor, bug-detector, pattern-reviewer | performance-auditor |
| Middleware/Cross-cutting | security-auditor, bug-detector | architecture-auditor |
| Config/Infrastructure | security-auditor, architecture-auditor | -- |
| Tests | testing-auditor | pattern-reviewer |
| Mixed/Unknown | bug-detector, pattern-reviewer, stack-reviewer | -- |

Rules:
- Each segment gets 2-4 agents maximum (more agents = more noise, not better review)
- Primary agents always run. Secondary agents run only in quality/premium mode
- `--only` flag overrides this mapping entirely
- bug-detector is the most versatile agent and appears in most segments
- stack-reviewer is added to every segment in quality/premium mode (stack convention check)

Display dispatch plan:
```
Dispatch plan: {total_agents} agent instances across {N} segments
  Segment 1 ({type}): {agent1}, {agent2}, {agent3}
  Segment 2 ({type}): {agent1}, {agent2}
  ...
```

### Step 6: Dispatch Review Agents

Spawn agents in parallel batches per `$IMPLEMENTATION_MODE`:

**Economy mode:** Spawn agents sequentially per segment (one segment at a time, agents within segment are parallel). Pass `model: "sonnet"` for all agents.

**Quality mode:** Spawn ALL agents for ALL segments in parallel (single batch). Omit model parameter (inherit parent). Maximum concurrent agents: 15. If more agents needed, batch into groups of 15.

**Premium mode (default):** Same as quality but with higher concurrent limit (25) and secondary agents always included.

Model tier per agent:

| Agent | Economy | Quality | Premium |
|-------|---------|---------|---------|
| security-auditor | sonnet | opus | opus |
| bug-detector | sonnet | opus | opus |
| database-auditor | sonnet | opus | opus |
| architecture-auditor | sonnet | sonnet | opus |
| api-auditor | sonnet | sonnet | opus |
| frontend-auditor | sonnet | sonnet | opus |
| performance-auditor | sonnet | sonnet | opus |
| error-handling-auditor | sonnet | sonnet | opus |
| pattern-reviewer | sonnet | sonnet | opus |
| stack-reviewer | sonnet | sonnet | opus |
| testing-auditor | sonnet | sonnet | opus |
| integration-checker | sonnet | opus | opus |

For each agent spawn, provide context:
```
You are reviewing code as part of a BeeDev swarm review.

Segment: {segment name} ({segment type})
Files in this segment: {file list}
Stack: {stack name}

{context cache: stack skill, CONTEXT.md, false positives, user preferences, CLAUDE.md}
{dependency scan: expanded files for this segment}

Focus ONLY on the files in this segment. Review thoroughly within your domain.
Report findings in your standard output format with HIGH confidence only.
```

Track progress as agents complete:
```
[3/12] security-auditor (Controllers) complete: 2 findings
[4/12] bug-detector (Services) complete: 5 findings
```

### Step 7: Consolidation

Collect all findings from all completed agents. Group by segment.

Spawn `swarm-consolidator` agent with the complete set of raw findings:
```
Consolidate these swarm review findings.

Segments: {list of segments with their agents and finding counts}

{all raw findings grouped by segment, each with source agent attribution}

Apply deduplication, cross-agent consensus scoring, and produce severity-ordered output.
```

Model selection for consolidator: Economy = sonnet, Quality/Premium = inherit (omit model parameter).

Parse the consolidator's output. Extract the consolidated findings list with SF-NNN IDs.

### Step 8: Validation (finding-validator)

Unless `--skip-validation` was specified:

1. For each consolidated finding (SF-NNN):
   - Build validation context with finding details + source agents
   - Spawn `finding-validator` agent
   - Batch up to 5 validators at a time
2. Collect classifications (REAL BUG / FALSE POSITIVE / STYLISTIC)
3. Handle MEDIUM confidence findings: escalate to a second finding-validator opinion (same two-opinion pattern as review.md Step 5.3)
4. Update finding Validation field with final classification
5. Handle FALSE POSITIVE findings: append to `.bee/false-positives.md` (if exists, and if `.bee/` directory exists)
6. Handle STYLISTIC findings: AskUserQuestion per finding ("Fix it" / "Ignore" / "False Positive" / "Custom")
7. Build confirmed findings list: all REAL BUG + user-approved STYLISTIC

Validator model selection: Economy = sonnet, Quality/Premium = inherit.

### Step 9: Generate SWARM-REVIEW.md

Determine output path based on invocation:
- **Post-phase:** `{phase_directory}/SWARM-REVIEW.md`
- **Post-implementation:** `{spec_path}/SWARM-REVIEW.md`
- **Ad-hoc:** `.bee/reviews/SWARM-YYYY-MM-DD-{N}.md` (N = sequential counter for today)
- **Cross-phase:** `{spec_path}/SWARM-REVIEW-{N}-{M}.md`
- **Pre-commit:** `.bee/reviews/SWARM-PRE-COMMIT-YYYY-MM-DD-{N}.md`
- **External:** `{target_path}/SWARM-REVIEW.md`

For ad-hoc and pre-commit paths: if `.bee/reviews/` directory does not exist, create it before writing the report.

Apply `--severity` filter if specified: only include findings matching the specified severities.

Write the report:

```markdown
# Swarm Review

## Summary
- **Date:** {YYYY-MM-DD}
- **Scope:** {invocation path description}
- **Files reviewed:** {count}
- **Segments:** {count} ({strategy})
- **Agents dispatched:** {total instances}
- **Status:** {CLEAN | HAS_FINDINGS}

## Metrics
| Metric | Value |
|--------|-------|
| Raw findings | {N} |
| After dedup | {N} |
| Consensus escalations | {N} |
| Validated (REAL BUG) | {N} |
| False positives | {N} |
| Stylistic | {N} |
| False positive rate | {N}% |

## Findings

{severity-ordered findings from consolidator, updated with validation results}

## Segmentation Detail

{per-segment breakdown: files, agents dispatched, findings count}

## Agent Performance

| Agent | Segments | Findings | Confirmed | FP Rate |
|-------|----------|----------|-----------|---------|
| {name} | {N} | {N} | {N} | {N}% |

## Dedup Summary
{from consolidator output}
```

### Step 10: Update STATE.md (if .bee/ exists)

If `.bee/STATE.md` exists, read it fresh from disk and update Last Action:
```
## Last Action
- Command: /bee:swarm-review
- Timestamp: {ISO 8601}
- Result: Swarm review complete -- {risk_level}, {confirmed} confirmed findings ({critical} critical, {high} high, {medium} medium), {fp_rate}% FP rate
```

Write updated STATE.md to disk.

### Step 11: Interactive Menu

Present results summary, then:

```
AskUserQuestion(
  question: "Swarm review complete. {N} confirmed findings ({critical} critical, {high} high). Report: {path}",
  options: ["Fix findings", "Re-review", "Audit-to-spec", "Accept", "Custom"]
)
```

- **Fix findings**: For each confirmed finding, spawn fixer agents using the same file-based parallelism strategy from review.md Step 6 (parallel across files, sequential within same file). Group findings by file, spawn one fixer per file group.
- **Re-review**: Re-run the swarm review pipeline from Step 1
- **Audit-to-spec**: Execute `/bee:audit-to-spec` on the generated report (convert to actionable spec)
- **Accept**: End command
- **Custom**: User types what they want

---

### Error Recovery

**Single agent crash/timeout:**
- Log the failure: `[FAILED] {agent-name} ({segment}): {error}`
- Continue with remaining agents -- do NOT abort the entire review
- Note the failed agent in report metadata under `## Agent Performance`
- Suggest the user re-run with `--only {failed-agent}` to retry just that agent
- If the failed agent had partial output before crashing, attempt to extract any complete findings

**Consolidator crash:**
- Fall back to raw findings dump (ungrouped, unsorted). Add warning banner at top of SWARM-REVIEW.md:
  "WARNING: Consolidation failed -- findings below are raw (undeduped, unscored). Review manually."

**Validator crash:**
- Fall back to including all findings as UNVALIDATED
- Add prominent warning: "WARNING: Validation was incomplete -- findings below have NOT been verified. Review manually."

**Multiple agent failures (>50% of dispatched agents fail):**
- Warn about environment issues: "Multiple agents failed ({N}/{M}). Possible environment issue (memory, disk, permissions). Check and retry."
- Continue with partial results

---

### Implementation Mode Delegation

The `$IMPLEMENTATION_MODE` (stored as `implementation_mode` in `.bee/config.json`) affects agent dispatch behavior:

- **Economy:** Sequential segment processing, sonnet for all agents, primary agents only
- **Quality:** Parallel all-at-once dispatch, mixed model tiers, primary + secondary agents
- **Premium (default):** Parallel with higher concurrency (25), all agents opus tier, secondary agents always included

### Handling Multi-Stack Projects

If `.bee/config.json` contains multiple stacks in the `.stacks` array:

1. Include files from ALL stacks in scope (unless a specific path narrows it)
2. Each agent receives the specific stack context for the files in its segment
3. Stack-agnostic agents (architecture, integration-checker) span across stacks
4. Segmentation respects stack boundaries -- files from different stacks go to different segments unless they share cross-stack imports
