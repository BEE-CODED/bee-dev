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

# Per-stack linter and test runner execution
# Read stacks from config (new per-stack format)
STACKS=$(jq -c '.stacks // []' "$CONFIG_FILE" 2>/dev/null)
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null)

# Fallback: check for old global format
GLOBAL_LINTER=$(jq -r '.linter // "none"' "$CONFIG_FILE" 2>/dev/null)
GLOBAL_RUNNER=$(jq -r '.testRunner // "none"' "$CONFIG_FILE" 2>/dev/null)

# If no stacks and both globals are "none", nothing to gate
if [ "$(echo "$STACKS" | jq 'length')" = "0" ] && [ "$GLOBAL_LINTER" = "none" ] && [ "$GLOBAL_RUNNER" = "none" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

LINT_FAILED=0
TEST_FAILED=0

# Process each stack — use process substitution to avoid subshell variable scope issue
# (pipe | while creates a subshell where LINT_FAILED/TEST_FAILED changes are lost)
while IFS= read -r STACK; do
    [ -z "$STACK" ] && continue

    STACK_PATH=$(echo "$STACK" | jq -r '.path // "."')
    STACK_LINTER=$(echo "$STACK" | jq -r '.linter // empty')
    STACK_RUNNER=$(echo "$STACK" | jq -r '.testRunner // empty')

    # Fallback to global values if per-stack not set
    [ -z "$STACK_LINTER" ] && STACK_LINTER="$GLOBAL_LINTER"
    [ -z "$STACK_RUNNER" ] && STACK_RUNNER="$GLOBAL_RUNNER"

    # Check if any staged files belong to this stack
    if [ "$STACK_PATH" = "." ]; then
        HAS_FILES=$(echo "$STAGED_FILES" | head -1)
    else
        HAS_FILES=$(echo "$STAGED_FILES" | grep "^${STACK_PATH}/" | head -1)
    fi
    [ -z "$HAS_FILES" ] && continue

    # Resolve working directory for this stack
    WORK_DIR="$CLAUDE_PROJECT_DIR"
    [ "$STACK_PATH" != "." ] && WORK_DIR="$CLAUDE_PROJECT_DIR/$STACK_PATH"

    # Run linter for this stack (scoped to stack directory)
    if [ "$STACK_LINTER" != "none" ] && [ -n "$STACK_LINTER" ]; then
        case "$STACK_LINTER" in
            pint)
                if [ -f "$WORK_DIR/vendor/bin/pint" ]; then
                    LINT_OUTPUT=$(cd "$WORK_DIR" && vendor/bin/pint --test 2>&1) || LINT_FAILED=1
                fi
                ;;
            eslint)
                if [ -f "$WORK_DIR/node_modules/.bin/eslint" ]; then
                    LINT_OUTPUT=$(cd "$WORK_DIR" && npx eslint . 2>&1) || LINT_FAILED=1
                fi
                ;;
            prettier)
                if [ -f "$WORK_DIR/node_modules/.bin/prettier" ]; then
                    LINT_OUTPUT=$(cd "$WORK_DIR" && npx prettier --check . 2>&1) || LINT_FAILED=1
                fi
                ;;
            biome)
                if [ -f "$WORK_DIR/node_modules/.bin/biome" ]; then
                    LINT_OUTPUT=$(cd "$WORK_DIR" && npx biome check . 2>&1) || LINT_FAILED=1
                fi
                ;;
        esac
    fi

    # Run test runner for this stack (scoped to stack directory)
    if [ "$STACK_RUNNER" != "none" ] && [ -n "$STACK_RUNNER" ]; then
        case "$STACK_RUNNER" in
            pest)
                if [ -f "$WORK_DIR/vendor/bin/pest" ]; then
                    TEST_OUTPUT=$(cd "$WORK_DIR" && php artisan test --parallel 2>&1) || TEST_FAILED=1
                fi
                ;;
            vitest)
                if [ -f "$WORK_DIR/node_modules/.bin/vitest" ]; then
                    TEST_OUTPUT=$(cd "$WORK_DIR" && npx vitest run 2>&1) || TEST_FAILED=1
                fi
                ;;
            jest)
                if [ -f "$WORK_DIR/node_modules/.bin/jest" ]; then
                    TEST_OUTPUT=$(cd "$WORK_DIR" && npx jest 2>&1) || TEST_FAILED=1
                fi
                ;;
        esac
    fi
done < <(echo "$STACKS" | jq -c '.[]' 2>/dev/null)

if [ "$LINT_FAILED" = "1" ]; then
    echo '{"decision": "block", "reason": "Pre-commit gate: linter errors found. Fix them before committing."}'
    exit 0
fi

if [ "$TEST_FAILED" = "1" ]; then
    echo '{"decision": "block", "reason": "Pre-commit gate: tests failing. Fix them before committing."}'
    exit 0
fi

# All gates passed -- allow commit
exit 0
