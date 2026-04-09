---
description: Run the full spec lifecycle ceremony -- audit, changelog, git tag, archive, and spec history
argument-hint: "[--skip-audit] [--skip-tag]"
---

## Current State (load before proceeding)

Read these files using the Read tool:
- `.bee/STATE.md` -- if not found: NOT_INITIALIZED
- `.bee/config.json` -- if not found: use `{}`

## Instructions

You are running `/bee:complete-spec` -- the full spec lifecycle ceremony command for BeeDev. This command runs the complete ceremony: audit (traceability) -> changelog -> git tag -> archive -> spec history -> STATE.md reset -> version bump. Follow these steps in order. This command never auto-commits -- the user decides when to commit via `/bee:commit`.

### Step 1: Validation Guards

Check these guards in order. Stop immediately if any fails:

1. **NOT_INITIALIZED guard:** If the dynamic context above contains "NOT_INITIALIZED" (meaning `.bee/STATE.md` does not exist), tell the user:
   "BeeDev is not initialized. Run `/bee:init` first."
   Do NOT proceed.

2. **NO_SPEC guard:** Read STATE.md from the dynamic context above. If Current Spec Status is `NO_SPEC` or Current Spec Path shows "(none)", tell the user:
   "No active spec found. Run `/bee:new-spec` first."
   Do NOT proceed.

3. **Spec directory guard:** Read the Current Spec Path from STATE.md. Check that the spec directory exists on disk using Bash (`test -d {spec-path}`). If the directory does not exist, tell the user:
   "Spec directory not found at `{spec-path}`. STATE.md may be stale."
   Do NOT proceed.

### Step 2: Pre-completion Checklist

Read the Phases table from STATE.md. Check each phase row:

1. For each phase where the Status column is NOT `COMMITTED`, collect its phase number and name.
2. If any phases are not COMMITTED, display a warning:
   ```
   Warning: The following phases are not COMMITTED:
   - Phase {N}: {name} (Status: {status})
   - Phase {M}: {name} (Status: {status})
   ...
   ```
   AskUserQuestion(
     question: "Some phases not committed. Complete anyway?",
     options: ["Complete", "Cancel", "Custom"]
   )
   If the user selects "Cancel", display "Completion cancelled." and stop.
3. If all phases are COMMITTED (or no phases exist), proceed without warning.

### Step 3: Run Audit (auto)

1. Check if `--skip-audit` flag is present in `$ARGUMENTS`. If so, display "Audit skipped per --skip-audit flag." and continue to Step 4.
2. Also check config.json: if `lifecycle.require_audit_before_complete` is explicitly `false`, display "Audit skipped per config (lifecycle.require_audit_before_complete = false)." and continue to Step 4.
3. Otherwise, run the audit logic inline (do NOT invoke /bee:audit-spec as a subcommand -- embed the audit logic directly):

   **3a. Parse spec.md requirements:**
   - Read `spec.md` from the active spec directory (path: `{Current Spec Path}/spec.md`).
   - Extract all requirements. Requirements are identified by any of these patterns:
     - Checkbox lines with an ID: `- [ ] **REQ-01**: description` or `- [x] **REQ-01**: description`
     - Checkbox lines with alternative ID formats: `R-01`, `FEAT-01`, `FUNC-01`, `NFR-01`, etc. (any uppercase prefix followed by a dash and digits)
     - Numbered requirement lists under a "Requirements" heading
     - Bulleted requirement sections with IDs in bold
   - Requirement ID pattern matching should be case-insensitive and support the general pattern: `[A-Z]+-\d+`.
   - Build a requirements list: `[{ id, description, checked }]`
   - If no requirements found, display: "No parseable requirements found in spec.md. Skipping audit." and continue to Step 4.

   **3b. Trace requirements to phases (via TASKS.md):**
   - Read the Phases table from STATE.md to get the list of phases with their names and statuses.
   - Detect phase directories within the spec path. Look for subdirectories matching: `phase-{N}/` or `{NN}-{name}/`.
   - For each phase directory, read `TASKS.md` if it exists and search for requirement IDs to determine mappings.
   - Requirements not found in any TASKS.md are flagged as "Orphaned".

   **3c. Trace requirements to reviews (via REVIEW.md):**
   - For each phase that has a requirement mapped, check if `REVIEW.md` exists.
   - If found, search for the requirement ID (case-insensitive). Mark as "Reviewed: Yes" or "Reviewed: Not confirmed".
   - If no REVIEW.md exists, mark as "Reviewed: No review".

   **3d. Trace requirements to tests (via TESTING.md):**
   - For each phase that has a requirement mapped, check if `TESTING.md` exists.
   - If found, search for the requirement ID (case-insensitive). Mark as "Tested: Yes" or "Tested: Not covered".
   - If no TESTING.md exists, mark as "Tested: No test file".

   **3e. Compute coverage:**
   - **Satisfied**: Has phase assignment AND review confirmation AND test coverage
   - **Partial**: Has phase assignment but missing review OR test
   - **Orphaned**: Not mapped to any phase
   - **Untested**: Implemented and reviewed but no test coverage
   - Coverage percentage: `satisfied_count / total_requirements * 100` (rounded to nearest integer)

   **3f. Display traceability matrix and coverage summary:**
   ```
   Spec Traceability Audit: {spec-name}

   | Req | Description | Phase | Implemented | Reviewed | Tested | Status |
   |-----|------------|-------|-------------|----------|--------|--------|
   | REQ-01 | ... | Phase 1 | Yes | Yes | Yes | Satisfied |

   Coverage: {satisfied}/{total} satisfied ({percentage}%)
   ```

4. If coverage < 100%:
   AskUserQuestion(
     question: "Audit shows {percentage}% coverage. {issue_count} issues found. Proceed with completion?",
     options: ["Proceed", "Cancel", "Custom"]
   )
   If the user selects "Cancel", display "Completion cancelled." and stop.
5. If coverage = 100%, display "Audit passed: 100% traceability coverage." and continue.

### Step 4: Generate CHANGELOG.md

1. Read spec.md requirements to categorize changes:
   - New features (new capabilities) -> **Added**
   - Modifications to existing behavior -> **Changed**
   - Bug fixes, review findings resolved -> **Fixed**
   - Internal refactoring, test improvements -> **Internal**

2. Read git stats for the spec's lifetime:
   - Find the first commit related to this spec (by spec directory creation or earliest commit touching the spec path).
   - Count files changed and lines added/removed since that commit using `git diff --stat`.
   - Count total phases from STATE.md Phases table.

3. Generate a CHANGELOG entry with this format:
   ```markdown
   # Changelog: {spec-name}

   ## {spec-name} ({YYYY-MM-DD})

   ### Added
   - {requirement description for new features}

   ### Changed
   - {requirement description for modifications}

   ### Fixed
   - {requirement description for bug fixes / review findings resolved}

   ### Internal
   - {refactoring, test improvements, infrastructure}

   ### Stats
   - Files changed: {N}
   - Lines added: {N}
   - Lines removed: {N}
   - Phases: {N}
   ```

4. Display the generated changelog to the user for review:
   AskUserQuestion(
     question: "Review the generated changelog:",
     options: ["Approve", "Edit", "Skip changelog", "Custom"]
   )
   - **Approve**: Write the changelog entry to `.bee/archive/{spec-folder-name}/CHANGELOG.md` (the file will be at this path after Step 6 moves the spec there -- write the CHANGELOG.md into the spec directory now, before the move, so it gets moved with the spec).
   - **Edit**: Let the user provide edits, then write the updated content.
   - **Skip changelog**: Continue without writing a changelog. Record "skipped" for the summary.

### Step 5: Create Annotated Git Tag

1. Check if `--skip-tag` flag is present in `$ARGUMENTS`. If so, display "Git tag skipped per --skip-tag flag." and continue to Step 6.
2. Also check config.json: if `lifecycle.git_tag_on_complete` is explicitly `false`, display "Git tag skipped per config (lifecycle.git_tag_on_complete = false)." and continue to Step 6.
3. Read tag format from config.json: `lifecycle.tag_format` (default: `spec/{slug}/v1`). Replace `{slug}` with the spec slug (derived from spec folder name, stripping the date prefix -- e.g., `2026-04-09-user-management` becomes `user-management`).
4. Create the annotated tag:
   ```bash
   git tag -a "{tag}" -m "Spec completed: {spec-name}
   Date: {YYYY-MM-DD}
   Requirements: {satisfied}/{total} satisfied
   Phases: {phase-count}
   Archive: .bee/archive/{spec-folder-name}/"
   ```
5. Display: "Git tag created: `{tag}`"
6. Do NOT push the tag. The user pushes manually if desired.

### Step 6: Archive to .bee/archive/

This step reuses the same logic as `/bee:archive-spec` Steps 3-4:

1. Create the archive directory: `mkdir -p .bee/archive/`
2. Move the spec directory to the archive: `mv {spec-path} .bee/archive/{spec-folder-name}/`
   - The spec folder name is the last path component of the Current Spec Path (e.g., `2026-02-20-user-management` from `.bee/specs/2026-02-20-user-management/`).
3. Verify the move succeeded:
   - Check that the archive destination exists: `test -d .bee/archive/{spec-folder-name}/`
   - Check that the original location no longer exists: `test ! -d {spec-path}`
   - If verification fails, tell the user: "Archive move failed. The spec directory may be in an inconsistent state. Check `.bee/archive/` and `.bee/specs/` manually." Stop.
4. If the changelog was generated (Step 4), it is already inside the spec directory and was moved with it.

### Step 7: Write Spec History Entry

1. Create the history directory: `mkdir -p .bee/history/`
2. Read `.bee/history/SPEC-HISTORY.md` if it exists. If not, create it with this initial content:
   ```markdown
   # Spec History

   Reverse-chronological record of completed specs.

   | # | Spec | Tag | Date | Phases | Coverage | Status |
   |---|------|-----|------|--------|----------|--------|
   ```
3. Prepend a new row after the table header (reverse chronological -- newest first):
   ```
   | {N} | {spec-name} | {tag or "no tag"} | {YYYY-MM-DD} | {phase-count} | {coverage}% | Completed |
   ```
   Where `{N}` is the next sequence number (count existing rows + 1).
4. Write the updated SPEC-HISTORY.md to disk.

### Step 8: Reset STATE.md

This step reuses the same logic as `/bee:archive-spec` Steps 5-6:

**First write -- set ARCHIVED:**
1. Read current `.bee/STATE.md` from disk (fresh read -- Read-Modify-Write pattern).
2. Set Current Spec Status to `ARCHIVED`.
3. Keep the Current Spec Name and Path as they were (for the audit trail).
4. Leave the Phases table as-is.
5. Update Last Action:
   - Command: `/bee:complete-spec`
   - Timestamp: current ISO 8601 timestamp
   - Result: "Spec completed: {spec-name}"
6. Write STATE.md to disk.

**Second write -- set NO_SPEC:**
1. Read current `.bee/STATE.md` from disk again (fresh read).
2. Set Current Spec Status to `NO_SPEC`.
3. Clear Current Spec Name to `(none)`.
4. Clear Current Spec Path to `(none)`.
5. Leave the Phases table as-is (preserving the record of what was done).
6. Keep the Last Action from the first write unchanged.
7. Write STATE.md to disk.

**Bump plugin version:**
1. Read the plugin manifest at `plugins/bee/.claude-plugin/plugin.json` (adjust path relative to project root; if running within a project that uses the bee plugin, use `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` via Bash to resolve).
2. Parse the `version` field (semver format: `MAJOR.MINOR.PATCH`).
3. Increment the PATCH number by 1 (e.g., `2.1.0` becomes `2.1.1`, `1.0.9` becomes `1.0.10`).
4. Write the updated plugin.json back to disk with the new version, preserving all other fields.
5. Display: "Plugin version bumped: {old-version} -> {new-version}"

### Step 9: Summary

Display the completion summary:

```
Spec completed!

- Spec: {spec-name}
- Audit: {coverage}% ({satisfied}/{total} satisfied)
- Changelog: {written to archive path or "skipped"}
- Git tag: {tag or "skipped"}
- Archived to: .bee/archive/{spec-folder-name}/
- History: .bee/history/SPEC-HISTORY.md updated
- Plugin version: {new-version}
```

AskUserQuestion(
  question: "Spec lifecycle complete.",
  options: ["New Spec", "View history", "Custom"]
)

- **"New Spec"**: Display "Run `/bee:new-spec` to start a new specification."
- **"View history"**: Read and display `.bee/history/SPEC-HISTORY.md`.
- **"Custom"**: Wait for user input.

---

**Design Notes (do not display to user):**

- This command does NOT use any agents -- it operates entirely in the main Claude context. No `Task(` calls or agent spawning.
- The audit logic is INLINED from `/bee:audit-spec`, not delegated to it as a subcommand. This avoids subcommand invocation complexity while keeping audit-spec available as a standalone command for users who want to run audits independently.
- `/bee:archive-spec` is UNCHANGED -- it remains as the lightweight "skip ceremony" fast path. `/bee:complete-spec` is the full ceremony that adds audit, changelog, git tag, and spec history on top of the archival.
- The changelog is spec-driven (from requirements categorized as Added/Changed/Fixed/Internal), not commit-driven. Git stats (files changed, lines added/removed) are supplementary context only.
- Tag format uses `{slug}` placeholder, not `{version}`. Bee is spec-centric, not version-centric. The user can configure any format they want via `lifecycle.tag_format` in config.json.
- The double-write STATE.md pattern (ARCHIVED then NO_SPEC) is identical to `/bee:archive-spec` -- it creates a clean transition record in the audit trail.
- This command does not commit anything. The user runs `/bee:commit` separately if they want to commit the state changes.
- No auto-push of git tags. The user pushes manually.
- The CHANGELOG.md is written into the spec directory before the archive move, so it gets moved with the spec to `.bee/archive/{spec-folder-name}/CHANGELOG.md`.
- The SPEC-HISTORY.md file in `.bee/history/` is a persistent reverse-chronological record across all completed specs, separate from the per-spec CHANGELOG.md.
- When a requirement appears in multiple phases, it is marked as implemented/reviewed/tested if ANY phase references it (same logic as audit-spec standalone).
