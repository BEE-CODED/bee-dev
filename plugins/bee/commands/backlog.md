---
description: List, promote, or archive seeds from the idea backlog
argument-hint: "[list|promote S-NNN|archive S-NNN]"
---

## Current State (load before proceeding)

Read these files using the Read tool:
- `.bee/STATE.md` — if not found: NOT_INITIALIZED
- `.bee/config.json` — if not found: use `{}`

## Instructions

You are running `/bee:backlog` -- manage your seed backlog. List all seeds, promote one to a spec, or archive seeds you no longer need. Follow these steps in order. This command never auto-commits -- the user decides when to commit via `/bee:commit`.

### Step 1: Validation

1. **NOT_INITIALIZED guard:** If the dynamic context above contains "NOT_INITIALIZED" (meaning `.bee/STATE.md` does not exist), tell the user:
   "BeeDev is not initialized. Run `/bee:init` first."
   Do NOT proceed.

2. Parse `$ARGUMENTS` for subcommand: `list` (default if no arguments), `promote S-NNN`, `archive S-NNN`.

### Step 2: Route Subcommand

Based on the parsed subcommand, execute the corresponding section below.

---

#### list (default)

1. Glob `.bee/seeds/seed-*.md` to find all seed files.
2. If no seeds found: display "No seeds planted. Run `/bee:seed 'idea' --trigger 'condition'` to capture an idea." Stop.
3. For each seed file, read the frontmatter: `id`, `idea`, `trigger`, `planted`, `declined`, `status`.
4. Separate seeds into active and archived groups.
5. Display the active seeds table:

```
Seed Backlog ({N} active, {M} archived)

| ID | Idea | Trigger | Planted | Declined | Status |
|----|------|---------|---------|----------|--------|
| S-001 | Rate limiting | when we add API auth | 2026-04-09 | 0 | active |
| S-002 | Dark mode | next UI overhaul | 2026-03-15 | 2 | active |
```

6. If there are archived seeds, display them in a separate section:

```
Archived Seeds:
| ID | Idea | Trigger | Archived Reason |
|----|------|---------|-----------------|
| S-003 | Old feature | when X | expired (6 months) |
```

7. After the table:

```
AskUserQuestion(
  question: "Manage seeds:",
  options: ["Promote a seed", "Archive a seed", "Plant new seed", "Custom"]
)
```

---

#### promote S-NNN

1. Find seed file by ID: map `S-NNN` to `seed-NNN.md` (e.g., `S-003` maps to `.bee/seeds/seed-003.md`).
2. If the file does not exist: display "Seed S-{NNN} not found." Stop.
3. Read the seed content (idea + trigger from frontmatter).
4. Display: "Promoting seed S-{NNN}: {idea}"
5. Display: "Run `/bee:new-spec {idea}` to create a spec from this seed."
6. Update the seed frontmatter: set `status: promoted`.
7. Do NOT auto-invoke `/bee:new-spec` -- the developer decides when to act.

---

#### archive S-NNN

1. Find seed file by ID: map `S-NNN` to `seed-NNN.md`.
2. If the file does not exist: display "Seed S-{NNN} not found." Stop.
3. Update seed frontmatter: set `status: archived`, add `archived_date: {YYYY-MM-DD}`.
4. Display: "Seed S-{NNN} archived."

---

**Design Notes (do not display to user):**

- This command does not use any agents -- it operates entirely within the main Claude context.
- This command does not commit anything. The user runs `/bee:commit` separately if they want to commit.
- Subcommands are inline (not separate command files) for simplicity.
- The `promote` action updates seed status to `promoted` but does NOT auto-invoke `/bee:new-spec` -- the developer decides when to act on the promoted seed.
- Seeds with `status: archived` are shown in the list output in a separate "Archived Seeds" section but are excluded from auto-surface during `/bee:new-spec`.
- Seeds with `status: promoted` are also excluded from auto-surface (they've already been acted on).
- The seed glob pattern `.bee/seeds/seed-*.md` ensures only properly named seed files are processed.
- No Task() agents are spawned. Pure command logic with Read, Write, Glob, and Bash.
