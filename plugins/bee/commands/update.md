---
description: Update bee statusline and clean up legacy local copies
argument-hint: ""
---

## Instructions

You are running `/bee:update` -- updates the bee statusline to the latest version from the plugin source and cleans up any legacy local copies.

### Step 1: Read Current State

Use Bash to gather current state in parallel:

1. Check global statusline: Read `~/.claude/hooks/bee-statusline.js` using the Read tool (if not found, note as NOT INSTALLED). Extract the BEE_VERSION line from the first 5 lines.
2. Check local legacy copy: `test -f .bee/statusline.js && echo "EXISTS" || echo "NONE"`
3. Check local settings: Read `.claude/settings.json` using the Read tool (if not found, note as NONE)
4. Read plugin version: read `${CLAUDE_PLUGIN_ROOT}/../.claude-plugin/plugin.json` (resolve relative to this command's directory, i.e., the plugin root's `.claude-plugin/plugin.json`)

### Step 2: Show Current Status

Display what was found:

```
Bee Update Check

Plugin version: v{version from plugin.json}
Global statusline (~/.claude/hooks/bee-statusline.js):
  {If exists: "installed — version {extracted version or 'unknown'}" | If missing: "NOT INSTALLED"}
Legacy local copy (.bee/statusline.js):
  {If exists: "found (will be removed)" | If missing: "clean"}
Legacy local config (.claude/settings.json statusLine):
  {If exists and points to .bee/statusline.js: "found (will be cleaned)" | Otherwise: "clean"}
```

### Step 3: Update Global Statusline

Run the setup script to copy the latest statusline with version injection:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/setup-statusline.js
```

Resolve `${CLAUDE_PLUGIN_ROOT}` relative to this command file (i.e., `../scripts/setup-statusline.js` from the commands directory).

After running, verify the copy was successful by checking `~/.claude/hooks/bee-statusline.js` exists.

### Step 4: Clean Up Legacy Local Copies

1. **If `.bee/statusline.js` exists:** delete it via Bash (`rm .bee/statusline.js`).
2. **If `.claude/settings.json` exists and has `statusLine` pointing to `.bee/statusline.js`:**
   - Read the file, remove the `statusLine` key.
   - If the file has no other keys after removal, delete the file entirely.
   - If it has other keys, write it back without the `statusLine` key.

### Step 4b: Implementation Mode Recommendation

Re-read `.bee/config.json` from disk (Read-Modify-Write pattern). If `implementation_mode` is `"quality"` or `"economy"`:

```
AskUserQuestion(
  question: "Your implementation mode is set to \"{current_mode}\". Premium mode (opus for all agents) is now the recommended default for maximum quality. Switch to premium?",
  options: ["Yes, switch to premium", "Keep {current_mode}", "Custom"]
)
```

If "Yes, switch to premium": update `config.implementation_mode` to `"premium"` in `.bee/config.json` and note in the summary.
If "Keep": leave unchanged.

If `implementation_mode` is already `"premium"` or absent (defaults to premium): skip this step silently.

### Step 5: Summary

Display the result:

```
Bee updated!

Global statusline: v{version} (updated)
{If legacy local was cleaned: "Cleaned: .bee/statusline.js removed"}
{If legacy config was cleaned: "Cleaned: .claude/settings.json statusLine removed"}

The statusline auto-updates on every session start via the plugin's SessionStart hook.
```

Then present an interactive menu:

```
AskUserQuestion(
  question: "Bee updated. [summary]",
  options: ["Health check", "Accept", "Custom"]
)
```

The `[summary]` is a one-line recap of what changed (e.g. "Statusline updated to v1.2.3, legacy copy removed.").
