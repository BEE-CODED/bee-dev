#!/bin/bash
set -euo pipefail

# BeeDev Autopilot -- orchestrates full spec execution via fresh Claude sessions
# Each step gets its own context window. STATE.md on disk coordinates.
# Usage: bash plugins/bee/scripts/autopilot.sh

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE_FILE=".bee/STATE.md"
CONFIG_FILE=".bee/config.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# --- STATE.md Parsing ---

get_spec_path() {
    grep "^- Path:" "$STATE_FILE" | head -1 | sed 's/^- Path: //' | xargs
}

get_spec_status() {
    grep "^- Status:" "$STATE_FILE" | head -1 | sed 's/^- Status: //' | xargs
}

get_total_phases() {
    awk '/^\| [0-9]/' "$STATE_FILE" | wc -l | tr -d ' '
}

get_phase_status() {
    local n=$1
    awk -F'|' '{
        gsub(/^[ \t]+|[ \t]+$/, "", $2)
        gsub(/^[ \t]+|[ \t]+$/, "", $4)
        if ($2 == "'"$n"'") print $4
    }' "$STATE_FILE"
}

get_phase_name() {
    local n=$1
    awk -F'|' '{
        gsub(/^[ \t]+|[ \t]+$/, "", $2)
        gsub(/^[ \t]+|[ \t]+$/, "", $3)
        if ($2 == "'"$n"'") print $3
    }' "$STATE_FILE"
}

# --- Claude Runner ---

run_claude() {
    local step_name="$1"
    local prompt="$2"

    echo -e "${CYAN}>>> $step_name${NC}"
    echo ""

    if ! claude -p "$prompt" --verbose; then
        echo -e "${RED}Step failed: $step_name${NC}"
        echo "Fix the issue and re-run: bash $0"
        exit 1
    fi

    echo ""
    echo -e "${GREEN}<<< $step_name complete${NC}"
    echo ""
}

# --- Steps ---

plan_phase() {
    local n=$1
    local name=$(get_phase_name "$n")

    run_claude "Plan Phase $n: $name" "
AUTOPILOT MODE -- no human gates, no AskUserQuestion, no confirmations.

Read these files:
- .bee/STATE.md
- .bee/config.json
- .bee/PROJECT.md (if exists)

Then read the command file at $PLUGIN_ROOT/commands/plan-phase.md for the full planning logic.

Execute planning for phase $n following that command's EXACT steps with these overrides:
- Step 1 guard 4 (Already planned): auto-proceed without asking, overwrite existing plan
- Step 6 (Present Plan to User for Approval): SKIP entirely -- auto-approve the plan
- Complete through Step 7 (Update STATE.md) and Step 8 (Completion Summary)

CRITICAL: Follow the command file's three-pass pipeline exactly (planner Pass 1, researcher, planner Pass 2). Spawn the agents as described. Update STATE.md when done.
"
}

execute_phase() {
    local n=$1
    local name=$(get_phase_name "$n")

    run_claude "Execute Phase $n: $name" "
AUTOPILOT MODE -- no human gates, no AskUserQuestion, no confirmations.

Read these files:
- .bee/STATE.md
- .bee/config.json
- .bee/PROJECT.md (if exists)

Then read the command file at $PLUGIN_ROOT/commands/execute-phase.md for the full execution logic.

Execute phase $n following that command's EXACT steps with these overrides:
- Step 1 guard 5 (Already executed): auto-proceed without asking
- Step 5c failure handling: on task failure after retry, choose (a) Continue to next wave automatically
- Complete through Step 6 (Completion)

CRITICAL: Spawn implementer agents in parallel per wave as described. Update TASKS.md checkboxes. Update STATE.md when done.
"
}

review_phase() {
    local n=$1
    local name=$(get_phase_name "$n")

    run_claude "Review Phase $n: $name" "
AUTOPILOT MODE -- no human gates, no AskUserQuestion, no confirmations.

Read these files:
- .bee/STATE.md
- .bee/config.json

Then read the command file at $PLUGIN_ROOT/commands/review.md for the full review logic.

Execute review following that command's EXACT steps with these overrides:
- Step 3.5 Test check: answer 'no' (skip tests)
- Step 4 point 7 (>10 findings): auto-proceed without asking
- Step 5 STYLISTIC findings: auto-fix ALL of them (choose option a for each one)
- Step 7 loop mode: disabled (single pass only)
- Complete through Step 8 (Completion)

CRITICAL: Spawn reviewer, finding-validators (parallel, batch 5), and fixers (sequential) as described. Auto-fix all REAL BUG + STYLISTIC findings. Document FALSE POSITIVES. Update STATE.md when done.
"
}

project_review() {
    run_claude "Project Review" "
AUTOPILOT MODE -- no human gates.

Read .bee/STATE.md and .bee/config.json.

Then read the command file at $PLUGIN_ROOT/commands/review-project.md for the full review logic.

Execute the project review following that command's EXACT steps. Spawn the project-reviewer agent, produce REVIEW-PROJECT.md, present the compliance summary, update STATE.md.
"
}

# --- Main ---

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  BeeDev Autopilot                      ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Validate
if [ ! -f "$STATE_FILE" ]; then
    echo -e "${RED}BeeDev not initialized. Run /bee:init first.${NC}"
    exit 1
fi

spec_status=$(get_spec_status)
if [ "$spec_status" = "NO_SPEC" ]; then
    echo -e "${RED}No spec found. Run /bee:new-spec first.${NC}"
    exit 1
fi

total=$(get_total_phases)
if [ "$total" -eq 0 ]; then
    echo -e "${RED}No phases found in STATE.md.${NC}"
    exit 1
fi

spec_path=$(get_spec_path)
echo -e "Spec: ${CYAN}$spec_path${NC}"
echo -e "Phases: ${CYAN}$total${NC}"
echo ""

# Phase loop
for phase in $(seq 1 "$total"); do
    status=$(get_phase_status "$phase")
    name=$(get_phase_name "$phase")

    echo -e "${YELLOW}--- Phase $phase/$total: $name (status: $status) ---${NC}"

    case "$status" in
        REVIEWED|COMMITTED)
            echo -e "${GREEN}Already reviewed. Skipping.${NC}"
            echo ""
            continue
            ;;
        PENDING)
            plan_phase "$phase"
            execute_phase "$phase"
            review_phase "$phase"
            ;;
        PLANNED)
            execute_phase "$phase"
            review_phase "$phase"
            ;;
        EXECUTING)
            execute_phase "$phase"
            review_phase "$phase"
            ;;
        EXECUTED)
            review_phase "$phase"
            ;;
        REVIEWING)
            review_phase "$phase"
            ;;
        *)
            echo -e "${RED}Unknown status: $status${NC}"
            exit 1
            ;;
    esac
done

# Project review
echo -e "${YELLOW}--- Final: Project Review ---${NC}"
project_review

# Done
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Autopilot Complete!                   ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "No commits were made."
echo "Review your changes before committing:"
echo "  git diff --stat"
echo "  git diff"
echo ""
