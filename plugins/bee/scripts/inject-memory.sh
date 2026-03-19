#!/bin/bash
# SubagentStart hook: inject user preferences into subagent context
# Reads agent_type from stdin JSON, outputs user.md as additionalContext
# Exit 0 always -- SubagentStart hooks cannot block subagent creation

if ! command -v jq &>/dev/null; then
  echo "inject-memory.sh: jq not found, skipping memory injection" >&2
  exit 0
fi

INPUT=$(cat)
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // empty' | sed 's/^bee://')

# Only inject memory for known bee agents
case "$AGENT_TYPE" in
  implementer|fixer|researcher|spec-writer|phase-planner|plan-reviewer|spec-shaper|finding-validator|integrity-auditor|test-auditor|test-planner|context-builder|laravel-inertia-vue-bug-detector|laravel-inertia-vue-pattern-reviewer|laravel-inertia-vue-implementer|quick-implementer|discuss-partner|bug-detector|pattern-reviewer|stack-reviewer|plan-compliance-reviewer|spec-reviewer)
    ;;
  *)
    if [ -f "$CLAUDE_PROJECT_DIR/.claude/bee-extensions/agents/${AGENT_TYPE}.md" ]; then
      :
    else
      exit 0
    fi
    ;;
esac

BEE_DIR="$CLAUDE_PROJECT_DIR/.bee"

# Read user preferences
if [ -f "$BEE_DIR/user.md" ]; then
  USER_PREFS=$(cat "$BEE_DIR/user.md" 2>/dev/null)
  if [ -n "$USER_PREFS" ]; then
    CONTEXT="## User Preferences
${USER_PREFS}

"
    printf '%s' "$CONTEXT" | jq -Rs '{
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext: .
      }
    }'
  fi
fi

exit 0
