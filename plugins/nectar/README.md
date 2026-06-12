# Nectar

Eight skills. No commands. No state machine. The methodology activates when you describe work in plain language.

## How it works

| Skill | When it activates | What it produces |
|-------|-------------------|-----------------|
| shape | Starting any new work — "let's build X", "add Y", "I have an idea" | `docs/work/<topic>/design.md` at feature/project scale; smaller work writes nothing |
| plan | When a shaped feature needs an execution plan | `docs/work/<topic>/plan.md` with tasks in dependency waves |
| build | Implementing — executing a plan or writing non-trivial code | No new artifact — updates `plan.md` checkboxes |
| review | After implementation or on "review this" | `docs/work/<topic>/review.md` plus fixes applied |
| debug | Any bug, test failure, or unexpected behavior | Root cause, fix, regression test; `docs/work/<topic>/debug-<slug>.md` only if the hunt spans sessions |
| audit | On "audit this", pre-release sweeps, unfamiliar codebases | Severity-grouped `docs/work/audit-YYYY-MM-DD.md` |
| capture | When an idea surfaces mid-work | One line in `docs/work/backlog.md` |
| resume | On "where were we", "what's next", new sessions on existing work | No artifact — status report and one proposed next action |

## The lifecycle

Shape → plan → build → review is the main path. Debug, audit, capture, and resume are satellites that activate when their condition is met.

## State convention

```
docs/work/
  backlog.md              # captured ideas, one line each
  <topic>/
    design.md             # what and why, with acceptance criteria
    plan.md               # tasks with checkboxes, grouped in waves
    debug-<slug>.md       # only if a bug hunt spans sessions
    review.md             # latest review findings
```

Checkboxes in plan.md are the progress state. Resuming means reading the folder and git history.

## Principles

1. **Scale to the task.** Trivial work gets no ceremony. Artifacts are created only when the work spans sessions or needs review traceability.
2. **Evidence over assertion.** Every finding, hypothesis, and claim carries file:line evidence. Unverified findings die in validation.
3. **Artifacts are the only truth.** No registry, no status machine.
4. **Never auto-commit.** Skills suggest commits with a message; the user approves.
5. **Conversation owns the process.** Skills teach Claude how to think; they do not script orchestration.

## Install

```
claude plugin marketplace add beecoded/bee
claude plugin install nectar@bee-dev
```
