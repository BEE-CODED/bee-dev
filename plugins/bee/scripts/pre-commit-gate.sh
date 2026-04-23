#!/bin/bash
# PreToolUse hook: validate linter/test gates before allowing git commit
# Receives JSON on stdin with tool_input.command
# Exit 0 with no stdout = allow, Exit 0 with JSON stdout = block
# Do NOT use set -euo pipefail -- handle missing files gracefully
#
# Optimizations applied (vs. previous full-repo gate):
#   1. Incremental lint: lint only staged files matching each linter's extensions
#      (skip linter entirely if no matching staged files).
#   2. Test impact analysis: vitest/jest run only tests related to staged files
#      via `vitest related` / `jest --findRelatedTests`. Pest/PHPUnit fall back
#      to the full suite (no clean equivalent — derived --filter is too brittle).
#   3. Parallel lint + tests within each stack (background jobs + wait).
#   4. Fast-path: skip gate entirely when no source files are staged
#      (markdown-only, .bee/, dotfiles, JSON/YAML-only commits → instant).
#
# Backwards compatibility: legacy global `.linter` / `.testRunner` (no `stacks`
# array) is treated as one virtual stack at path "." with the global tools.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Skip if not a git commit command
if ! echo "$COMMAND" | grep -qE '\bgit\s+commit\b'; then
  exit 0
fi

# Skip if no .bee/config.json (not a bee project)
CONFIG_FILE="$CLAUDE_PROJECT_DIR/.bee/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# Fix 4: Fast-path — if no source files are staged, skip gate entirely.
# This makes markdown-only / config-only / dotfile commits instant.
ALL_STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)
SOURCE_FILES=$(echo "$ALL_STAGED" | grep -E '\.(php|js|ts|jsx|tsx|vue|css|scss|svelte|mjs|mts|cjs|cts|less|py|go|rs|rb)$')
if [ -z "$SOURCE_FILES" ]; then
  exit 0
fi

# Read config in a single jq invocation
CONFIG_JSON=$(jq -c '{stacks: (.stacks // []), linter: (.linter // "none"), testRunner: (.testRunner // "none")}' "$CONFIG_FILE" 2>/dev/null)
[ -z "$CONFIG_JSON" ] && exit 0

STACKS=$(echo "$CONFIG_JSON" | jq -c '.stacks' 2>/dev/null)
GLOBAL_LINTER=$(echo "$CONFIG_JSON" | jq -r '.linter' 2>/dev/null)
GLOBAL_RUNNER=$(echo "$CONFIG_JSON" | jq -r '.testRunner' 2>/dev/null)

STACKS_LEN=$(echo "$STACKS" | jq 'length' 2>/dev/null)
[ -z "$STACKS_LEN" ] && STACKS_LEN=0

# Backwards compat: if no stacks array, synthesize one virtual stack at "."
# using the global linter/runner. Same fallback chain as before.
if [ "$STACKS_LEN" = "0" ]; then
  if [ "$GLOBAL_LINTER" = "none" ] && [ "$GLOBAL_RUNNER" = "none" ]; then
    exit 0
  fi
  STACKS=$(jq -nc --arg l "$GLOBAL_LINTER" --arg r "$GLOBAL_RUNNER" \
    '[{path: ".", linter: $l, testRunner: $r}]')
fi

LINT_FAILED=0
TEST_FAILED=0
LINT_OUTPUT=""
TEST_OUTPUT=""

# Cleanup helper for temp files
GATE_PID=$$
cleanup_tmp() {
  rm -f /tmp/lint.${GATE_PID}.*.log /tmp/lint.${GATE_PID}.*.rc \
        /tmp/test.${GATE_PID}.*.log /tmp/test.${GATE_PID}.*.rc 2>/dev/null
}
trap cleanup_tmp EXIT

# Helper: filter staged files by extension regex, restricted to a stack path.
# Outputs paths relative to the stack path (so linters/test runners receive
# correct relative paths when run from $WORK_DIR).
#   $1 = extension regex (e.g. '\.php$')
#   $2 = stack path (e.g. "." or "backend")
filter_staged() {
  local ext_re="$1"
  local stack_path="$2"
  if [ "$stack_path" = "." ]; then
    echo "$ALL_STAGED" | grep -E "$ext_re"
  else
    echo "$ALL_STAGED" | grep "^${stack_path}/" | grep -E "$ext_re" | sed "s|^${stack_path}/||"
  fi
}

# Process each stack sequentially; within a stack, lint + tests run in parallel.
while IFS= read -r STACK; do
    [ -z "$STACK" ] && continue

    STACK_PATH=$(echo "$STACK" | jq -r '.path // "."')
    STACK_NAME=$(echo "$STACK" | jq -r '.name // .path // "default"' | tr -c 'A-Za-z0-9_' '_')
    STACK_LINTER=$(echo "$STACK" | jq -r '.linter // empty')
    STACK_RUNNER=$(echo "$STACK" | jq -r '.testRunner // empty')

    # Fallback to global values if per-stack not set (backwards compat)
    [ -z "$STACK_LINTER" ] && STACK_LINTER="$GLOBAL_LINTER"
    [ -z "$STACK_RUNNER" ] && STACK_RUNNER="$GLOBAL_RUNNER"

    # Skip stack if no staged files belong to it
    if [ "$STACK_PATH" = "." ]; then
        HAS_FILES=$(echo "$ALL_STAGED" | head -1)
    else
        HAS_FILES=$(echo "$ALL_STAGED" | grep "^${STACK_PATH}/" | head -1)
    fi
    [ -z "$HAS_FILES" ] && continue

    # Resolve working directory for this stack
    WORK_DIR="$CLAUDE_PROJECT_DIR"
    [ "$STACK_PATH" != "." ] && WORK_DIR="$CLAUDE_PROJECT_DIR/$STACK_PATH"

    LINT_LOG="/tmp/lint.${GATE_PID}.${STACK_NAME}.log"
    LINT_RC_FILE="/tmp/lint.${GATE_PID}.${STACK_NAME}.rc"
    TEST_LOG="/tmp/test.${GATE_PID}.${STACK_NAME}.log"
    TEST_RC_FILE="/tmp/test.${GATE_PID}.${STACK_NAME}.rc"
    LINT_PID=""
    TEST_PID=""

    # ---- Fix 1: Incremental lint (only staged files for this stack) ----
    if [ "$STACK_LINTER" != "none" ] && [ -n "$STACK_LINTER" ]; then
        case "$STACK_LINTER" in
            pint)
                if [ -f "$WORK_DIR/vendor/bin/pint" ]; then
                    PHP_FILES=$(filter_staged '\.php$' "$STACK_PATH")
                    if [ -n "$PHP_FILES" ]; then
                        ( cd "$WORK_DIR" && echo "$PHP_FILES" | xargs vendor/bin/pint --test > "$LINT_LOG" 2>&1; echo $? > "$LINT_RC_FILE" ) &
                        LINT_PID=$!
                    fi
                fi
                ;;
            eslint)
                if [ -f "$WORK_DIR/node_modules/.bin/eslint" ]; then
                    JS_FILES=$(filter_staged '\.(js|ts|jsx|tsx|vue|mjs|mts|cjs|cts)$' "$STACK_PATH")
                    if [ -n "$JS_FILES" ]; then
                        ( cd "$WORK_DIR" && echo "$JS_FILES" | xargs npx eslint > "$LINT_LOG" 2>&1; echo $? > "$LINT_RC_FILE" ) &
                        LINT_PID=$!
                    fi
                fi
                ;;
            prettier)
                if [ -f "$WORK_DIR/node_modules/.bin/prettier" ]; then
                    PRETTIER_FILES=$(filter_staged '\.(js|ts|jsx|tsx|vue|css|scss|less|json|md|yml|yaml|html|mjs|mts|cjs|cts)$' "$STACK_PATH")
                    if [ -n "$PRETTIER_FILES" ]; then
                        ( cd "$WORK_DIR" && echo "$PRETTIER_FILES" | xargs npx prettier --check > "$LINT_LOG" 2>&1; echo $? > "$LINT_RC_FILE" ) &
                        LINT_PID=$!
                    fi
                fi
                ;;
            biome)
                if [ -f "$WORK_DIR/node_modules/.bin/biome" ]; then
                    BIOME_FILES=$(filter_staged '\.(js|ts|jsx|tsx|json|jsonc|mjs|mts|cjs|cts)$' "$STACK_PATH")
                    if [ -n "$BIOME_FILES" ]; then
                        ( cd "$WORK_DIR" && echo "$BIOME_FILES" | xargs npx biome check > "$LINT_LOG" 2>&1; echo $? > "$LINT_RC_FILE" ) &
                        LINT_PID=$!
                    fi
                fi
                ;;
        esac
    fi

    # ---- Fix 2: Test impact analysis (vitest/jest) + Fix 3: parallel run ----
    if [ "$STACK_RUNNER" != "none" ] && [ -n "$STACK_RUNNER" ]; then
        case "$STACK_RUNNER" in
            pest)
                # Pest has no clean related-tests equivalent — fall back to full suite.
                # Deriving --filter from staged class names is too brittle (trait
                # users, factories, observers won't be picked up).
                if [ -f "$WORK_DIR/vendor/bin/pest" ]; then
                    PHP_TEST_FILES=$(filter_staged '\.php$' "$STACK_PATH")
                    if [ -n "$PHP_TEST_FILES" ]; then
                        ( cd "$WORK_DIR" && php artisan test --parallel > "$TEST_LOG" 2>&1; echo $? > "$TEST_RC_FILE" ) &
                        TEST_PID=$!
                    fi
                fi
                ;;
            phpunit)
                # Same caveat as pest — no clean related-tests; full suite.
                if [ -f "$WORK_DIR/vendor/bin/phpunit" ]; then
                    PHP_TEST_FILES=$(filter_staged '\.php$' "$STACK_PATH")
                    if [ -n "$PHP_TEST_FILES" ]; then
                        ( cd "$WORK_DIR" && vendor/bin/phpunit > "$TEST_LOG" 2>&1; echo $? > "$TEST_RC_FILE" ) &
                        TEST_PID=$!
                    fi
                fi
                ;;
            vitest)
                if [ -f "$WORK_DIR/node_modules/.bin/vitest" ]; then
                    JS_TEST_FILES=$(filter_staged '\.(js|ts|jsx|tsx|vue|mjs|mts|cjs|cts)$' "$STACK_PATH")
                    if [ -n "$JS_TEST_FILES" ]; then
                        # vitest related: only tests that import the staged files.
                        # If filtering misses new test files, the gate prefers a
                        # broader run — fall back to full suite on empty/error.
                        ( cd "$WORK_DIR" && echo "$JS_TEST_FILES" | xargs npx vitest related --run > "$TEST_LOG" 2>&1
                          rc=$?
                          if [ $rc -ne 0 ] && grep -qiE 'no test files|no tests found' "$TEST_LOG"; then
                              npx vitest run > "$TEST_LOG" 2>&1
                              rc=$?
                          fi
                          echo $rc > "$TEST_RC_FILE" ) &
                        TEST_PID=$!
                    fi
                fi
                ;;
            jest)
                if [ -f "$WORK_DIR/node_modules/.bin/jest" ]; then
                    JS_TEST_FILES=$(filter_staged '\.(js|ts|jsx|tsx|mjs|mts|cjs|cts)$' "$STACK_PATH")
                    if [ -n "$JS_TEST_FILES" ]; then
                        ( cd "$WORK_DIR" && echo "$JS_TEST_FILES" | xargs npx jest --findRelatedTests --passWithNoTests > "$TEST_LOG" 2>&1; echo $? > "$TEST_RC_FILE" ) &
                        TEST_PID=$!
                    fi
                fi
                ;;
        esac
    fi

    # Wait for both lint and tests for this stack (Fix 3).
    [ -n "$LINT_PID" ] && wait "$LINT_PID" 2>/dev/null
    [ -n "$TEST_PID" ] && wait "$TEST_PID" 2>/dev/null

    if [ -n "$LINT_PID" ]; then
        LINT_RC=$(cat "$LINT_RC_FILE" 2>/dev/null || echo 0)
        if [ "$LINT_RC" != "0" ]; then
            LINT_FAILED=1
            LINT_OUTPUT="$LINT_OUTPUT$(cat "$LINT_LOG" 2>/dev/null)\n"
        fi
    fi
    if [ -n "$TEST_PID" ]; then
        TEST_RC=$(cat "$TEST_RC_FILE" 2>/dev/null || echo 0)
        if [ "$TEST_RC" != "0" ]; then
            TEST_FAILED=1
            TEST_OUTPUT="$TEST_OUTPUT$(cat "$TEST_LOG" 2>/dev/null)\n"
        fi
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
