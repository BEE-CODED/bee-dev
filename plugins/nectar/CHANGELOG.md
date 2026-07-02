# Changelog

## 0.2.0 — 2026-07-02

### Changed
- Renamed the `resume` skill to `orient` — the old name collided with Claude Code's built-in `/resume` command. Triggers and behavior are unchanged: "where were we", "what's next", or any new session touching existing work in docs/work/.
- build now reads before it writes: before the first test of a task, read the files the task touches, their tests, and the nearest neighbors — reuse existing helpers and match local idioms instead of reinventing. Wave subagents get the same rule in their prompts.
- build closes each wave — and quick-scale work without a plan — by running the project's lint and typecheck commands after the test suite, when the project has them; tasks tick only when all are green.
- review's conventions lens now also hunts over-engineering: duplicated helpers, dead code, and abstraction beyond what the change needs.
- review's clean pass now requires a green test suite (plus lint and typecheck when the project has them) after the last applied fix — a clean lens pass over code that fails its own suite no longer counts as clean.
- Plugin manifest now carries repository, license, and keywords for the marketplace listing.

## 0.1.0 — 2026-06-12

Initial release: eight lifecycle skills (shape, plan, build, review, debug, audit, capture, resume) covering the full path from idea to reviewed implementation, with plain-file state in docs/work/.
