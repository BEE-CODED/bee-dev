#!/bin/bash
# SessionStart hook: load project context for Claude
# Stdout is added as context that Claude can see
# Do NOT use set -euo pipefail -- if one file is missing, continue reading others

BEE_DIR="$CLAUDE_PROJECT_DIR/.bee"

# Skip if .bee/ doesn't exist (project not initialized)
if [ ! -d "$BEE_DIR" ]; then
  exit 0
fi

# Clear stop-hook marker from previous session
rm -f "$BEE_DIR/.review-reminder-shown"

# Output state summary (stdout goes to Claude's context)
# Cap at 60 lines to prevent unbounded context growth
if [ -f "$BEE_DIR/STATE.md" ]; then
  echo "## Bee Project State"
  LINES=$(wc -l < "$BEE_DIR/STATE.md" | tr -d ' ')
  if [ "$LINES" -gt 60 ]; then
    head -n 60 "$BEE_DIR/STATE.md"
    echo ""
    echo "(STATE.md truncated at 60/$LINES lines -- read full file with Read tool if needed)"
  else
    cat "$BEE_DIR/STATE.md"
  fi
  echo ""
fi

if [ -f "$BEE_DIR/config.json" ]; then
  echo "## Bee Config"
  # Check for new per-stack format (stacks array with objects)
  STACKS_COUNT=$(jq '.stacks | length // 0' "$BEE_DIR/config.json" 2>/dev/null || echo "0")
  STACKS_IS_OBJECTS=$(jq -r '.stacks[0] | type // "null"' "$BEE_DIR/config.json" 2>/dev/null || echo "null")

  if [ "$STACKS_COUNT" -gt 0 ] 2>/dev/null && [ "$STACKS_IS_OBJECTS" = "object" ]; then
    # New per-stack format: stacks is an array of objects with name, path, linter, testRunner
    jq -r '.stacks[] | "Stack: \(.name) at '"'"'\(.path // ".")'"'"' (linter: \(.linter // "none"), tests: \(.testRunner // "none"))"' "$BEE_DIR/config.json" 2>/dev/null
  else
    # Old format: single stack string or stacks array of strings
    STACK=$(jq -r '.stacks[0] // .stack // "unknown"' "$BEE_DIR/config.json" 2>/dev/null || echo "unknown")
    echo "Stack: $STACK"
  fi
  echo ""
fi

# Load user preferences if exists
if [ -f "$BEE_DIR/user.md" ]; then
  echo "## User Preferences (user.md)"
  cat "$BEE_DIR/user.md"
  echo ""
fi

# Load session context if exists (from PreCompact snapshot)
if [ -f "$BEE_DIR/SESSION-CONTEXT.md" ]; then
  echo "## Previous Session Context"
  cat "$BEE_DIR/SESSION-CONTEXT.md"
  echo ""
fi

exit 0
