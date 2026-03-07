#!/bin/bash
# PreToolUse hook: validate linter/test gates before allowing git commit
# Receives JSON on stdin with tool_input.command
# Exit 0 with no stdout = allow, Exit 0 with JSON stdout = block
# Do NOT use set -euo pipefail -- handle missing files gracefully

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Skip if not a git commit command
if ! echo "$COMMAND" | grep -qE '\bgit\s+commit\b'; then
  exit 0
fi

# Skip if no .bee/config.json (not a bee project)
CONFIG_FILE="$CLAUDE_PROJECT_DIR/.bee/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  exit 0
fi

# Read linter and testRunner from config
LINTER=$(jq -r '.linter // "none"' "$CONFIG_FILE" 2>/dev/null)
TEST_RUNNER=$(jq -r '.testRunner // "none"' "$CONFIG_FILE" 2>/dev/null)

# If both are "none", nothing to gate
if [ "$LINTER" = "none" ] && [ "$TEST_RUNNER" = "none" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Run linter check if configured
if [ "$LINTER" != "none" ]; then
  LINT_OUTPUT=""
  LINT_EXIT=0

  case "$LINTER" in
    pint)
      LINT_OUTPUT=$(vendor/bin/pint --test 2>&1) || LINT_EXIT=$?
      ;;
    eslint)
      LINT_OUTPUT=$(npx eslint . 2>&1) || LINT_EXIT=$?
      ;;
    prettier)
      LINT_OUTPUT=$(npx prettier --check . 2>&1) || LINT_EXIT=$?
      ;;
    biome)
      LINT_OUTPUT=$(npx biome check . 2>&1) || LINT_EXIT=$?
      ;;
  esac

  if [ "$LINT_EXIT" -ne 0 ]; then
    echo '{"decision": "block", "reason": "Pre-commit gate: linter errors found. Fix them before committing."}'
    exit 0
  fi
fi

# Run test runner if configured
if [ "$TEST_RUNNER" != "none" ]; then
  TEST_OUTPUT=""
  TEST_EXIT=0

  case "$TEST_RUNNER" in
    pest)
      TEST_OUTPUT=$(php artisan test --parallel 2>&1) || TEST_EXIT=$?
      ;;
    vitest)
      TEST_OUTPUT=$(npx vitest run 2>&1) || TEST_EXIT=$?
      ;;
    jest)
      TEST_OUTPUT=$(npx jest 2>&1) || TEST_EXIT=$?
      ;;
  esac

  if [ "$TEST_EXIT" -ne 0 ]; then
    echo '{"decision": "block", "reason": "Pre-commit gate: tests failing. Fix them before committing."}'
    exit 0
  fi
fi

# All gates passed -- allow commit
exit 0
