---
description: Run all spec phases autonomously -- plan, execute, review via fresh sessions
argument-hint: ""
---

## Current State (load before proceeding)

Read these files using the Read tool:
- `.bee/STATE.md` -- if not found: NOT_INITIALIZED
- `.bee/config.json` -- if not found: use `{}`

## Instructions

You are running `/bee:autopilot` -- the autonomous execution launcher for BeeDev.

Autopilot uses a **bash script** that runs each phase step as a **separate `claude -p` session**. Each step gets a fresh context window. STATE.md on disk coordinates between steps. No compacting. No context bloat. No human gates.

### Step 1: Validation Guards

1. **NOT_INITIALIZED guard:** If `.bee/STATE.md` does not exist, tell the user:
   "BeeDev is not initialized. Run `/bee:init` first."
   Do NOT proceed.

2. **NO_SPEC guard:** If STATE.md shows Status: NO_SPEC, tell the user:
   "No spec found. Run `/bee:new-spec` first."
   Do NOT proceed.

3. **No phases guard:** If the Phases table in STATE.md has no rows, tell the user:
   "No phases found. Run `/bee:new-spec` to create a spec with phases."
   Do NOT proceed.

4. **All complete guard:** If ALL phases have Status REVIEWED or COMMITTED:
   "All phases already reviewed. Run `/bee:review-project` for the final compliance check."
   Do NOT proceed.

### Step 2: Launch

1. Determine the plugin root path. The autopilot script is at `{plugin_root}/scripts/autopilot.sh`.

2. Display to the user:
   ```
   Autopilot ready!

   Spec: {spec name}
   Phases: {total} ({pending} pending)

   How it works:
   - Each step (plan, execute, review) runs as a separate claude session
   - Fresh context per step -- no bloat, no compacting
   - STATE.md on disk coordinates between steps
   - No commits, no manual testing, all gates auto-approved

   The script will now run. Each step may take a few minutes.
   You can Ctrl+C at any time -- re-run /bee:autopilot to resume.
   ```

3. Run the script via Bash tool:
   ```
   bash {plugin_root}/scripts/autopilot.sh
   ```
   Use a long timeout (600000ms / 10 minutes) since the script runs multiple Claude sessions sequentially.

4. After the script completes, display:
   ```
   Autopilot finished!

   Review your changes:
     git diff --stat
     git diff

   When satisfied, commit with /bee:commit
   ```

### Error Handling

If the script exits with an error:
1. Display the error output
2. Tell the user: "Autopilot stopped at the step shown above. Fix the issue, then re-run `/bee:autopilot` to resume from where it left off."

The script is idempotent -- it reads STATE.md on each run and skips completed phases. Re-running always resumes correctly.

---

**Design Notes (do not display to user):**

- The script at `scripts/autopilot.sh` is the real orchestrator. This command file is just a launcher with guards.
- Each `claude -p` call in the script gets a fresh 200K context window. No context accumulation across steps.
- The script tells each Claude session to read the relevant command file (plan-phase.md, execute-phase.md, review.md) for logic, with overrides for human gates.
- STATE.md on disk is the sole coordination mechanism. The script reads phase statuses and determines what to do next.
- The script is safe to Ctrl+C. STATE.md reflects the last completed step. Re-running resumes.
- No commits during autopilot. The user reviews the diff after completion.
- No manual testing. TDD during execution provides test coverage.
- The old Autopilot section in STATE.md is no longer needed. The script uses the Phases table status directly.
