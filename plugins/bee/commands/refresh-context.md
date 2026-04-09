---
description: Re-run codebase context extraction, producing multi-document output (STACK.md, ARCHITECTURE.md, CONVENTIONS.md, CONCERNS.md)
argument-hint: ""
---

## Current State (load before proceeding)

Read these files using the Read tool:
- `.bee/STATE.md` — if not found: NOT_INITIALIZED
- `.bee/config.json` — if not found: use `{}`

## Instructions

You are running `/bee:refresh-context` -- a command that re-runs the context-builder agent to extract fresh codebase patterns and conventions into 4 structured documents (STACK.md, ARCHITECTURE.md, CONVENTIONS.md, CONCERNS.md) plus a backward-compatible CONTEXT.md summary. This is useful after significant code changes or when starting a new spec on an existing codebase. This command does not commit any changes. Follow these steps in order.

### Step 1: Validation Guard

If the dynamic context above contains `NOT_INITIALIZED` (meaning `.bee/STATE.md` does not exist), tell the user:

"BeeDev is not initialized. Run `/bee:init` first."

Do NOT proceed. Stop immediately.

### Step 2: Inform User

Display the following message to the user:

"Re-extracting codebase context into structured documents. This will overwrite .bee/STACK.md, .bee/ARCHITECTURE.md, .bee/CONVENTIONS.md, .bee/CONCERNS.md, and .bee/CONTEXT.md."

Proceed immediately -- do not ask for confirmation or wait for user input.

### Step 3: Spawn Context-Builder Agent

Read `config.implementation_mode` from config.json (defaults to `"premium"` if absent).

**Premium mode** (`implementation_mode: "premium"`): Omit the model parameter (inherit parent model) -- premium uses the strongest model for all work.

**Economy or Quality mode**: Pass `model: "sonnet"` -- scanning/planning work is structured and does not require deep reasoning.

Use the Task tool to spawn the `context-builder` agent with the model determined above. Context-building is structured scanning work -- it reads files, classifies patterns, and writes 5 structured context documents.

Provide the following context packet to the agent:
- The project root directory path
- The stack name from config.json (e.g., the value of `stacks[0].name` or `.stack`)
- Any additional config details that help the agent understand the codebase (e.g., test runner, linter)
- Instruction to produce multi-document output: the agent writes 5 files:
  - `.bee/STACK.md` (technologies, integrations, framework versions)
  - `.bee/ARCHITECTURE.md` (patterns, structure, module organization)
  - `.bee/CONVENTIONS.md` (naming, style, import patterns)
  - `.bee/CONCERNS.md` (tech debt, known issues, performance bottlenecks)
  - `.bee/CONTEXT.md` (combined summary for backward compatibility)

### Step 4: Display Completion

After the context-builder agent completes, display its completion message to the user. The agent outputs a summary in the format:

"Context extracted: 5 files written to .bee/ with {N} observations across 4 structured documents."

Then display:

"Context documents updated. Run `/bee:resume` to start a session with full codebase context."

### Step 5: Update STATE.md Last Action

Re-read `.bee/STATE.md` from disk (Read-Modify-Write pattern -- always read the current version before writing to avoid stale overwrites).

Update the Last Action section:
- **Command:** `/bee:refresh-context`
- **Timestamp:** current ISO 8601 timestamp
- **Result:** "Codebase context extracted to .bee/ (STACK.md, ARCHITECTURE.md, CONVENTIONS.md, CONCERNS.md, CONTEXT.md)"

Write the updated STATE.md back to disk.

### Step 6: Present Completion Menu

```
AskUserQuestion(
  question: "Context documents refreshed (5 files written to .bee/).",
  options: ["Accept", "Custom"]
)
```

---

**Design Notes (do not display to user):**

- The context-builder agent is spawned with `model: "sonnet"` for economy/quality mode (structured scanning via Glob/Grep/Read and template-based output). In premium mode, the model parameter is omitted (inherits parent model for maximum quality).
- No user confirmation is needed because the only side effects are overwriting derived context documents that can always be regenerated.
- The command does not auto-commit. The user decides when to commit via `/bee:commit`.
- The `/bee:resume` suggestion is important because resume reads context documents and presents them as part of the briefing -- this closes the loop for the user.
- The context packet includes the project root and stack config so the agent knows where to scan and what framework conventions to expect. The agent reads config.json itself, but passing the stack name upfront helps it prioritize scanning patterns.
- This command is idempotent -- running it multiple times simply overwrites the 5 context documents with fresh observations each time.
- The 4 structured documents (STACK.md, ARCHITECTURE.md, CONVENTIONS.md, CONCERNS.md) provide focused context for different agent needs. CONTEXT.md is maintained as a combined summary for backward compatibility.
