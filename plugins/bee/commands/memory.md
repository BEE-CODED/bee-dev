---
name: memory
description: View accumulated agent memories for the current project
user_invocable: true
arguments:
  - name: agent
    description: Optional agent name to filter (e.g., "implementer", "reviewer"). Shows all if omitted.
    required: false
---

# /bee:memory -- View Agent Memories

Display the accumulated project knowledge stored by agents in `.bee/memory/`.

## Instructions

1. Check if `.bee/memory/` directory exists. If not, display:
   ```
   No agent memories yet. Memories are created automatically as agents work on this project.
   ```
   Stop here.

2. Parse the optional argument `$ARGUMENTS`. If provided, treat it as an agent name filter.

3. Read all `.md` files in `.bee/memory/`:
   - `shared.md` -- cross-cutting project knowledge
   - `{agent-name}.md` -- per-agent knowledge (implementer, reviewer, fixer, etc.)

4. If an agent name filter was provided, show only `shared.md` and `{agent-name}.md`.

5. Display the memories in a clean format:

```
## Project Memory

### Shared
{contents of shared.md, or "(empty)" if no entries}

### {Agent Name}
{contents of {agent}.md, or "(empty)" if no entries}

...repeat for each agent memory file found...
```

6. Show a summary footer:

```
---
{N} memory files | {total lines} entries
Memories grow automatically as agents work. Edit .bee/memory/*.md to curate.
```

## Notes

- Memory files are created automatically by agents during execution. There is nothing to "add" manually.
- If a user wants to seed knowledge, they can edit `.bee/memory/shared.md` directly.
- Read-only agents (reviewer, finding-validator, integrity-auditor, test-auditor, project-reviewer) consume memory but don't write to it. Write-capable agents (implementer, fixer, researcher, spec-writer, phase-planner, plan-reviewer, test-planner, spec-shaper) both read and write.
