# Crossade Deck — repository root

This file is loaded in EVERY session, so it holds only what is true for every part of the repo.
Details live next to the code and load when you work there.

| where | what it is | its doc |
|---|---|---|
| `game-kit/` | **active work**: a library of presets and contracts for building board games | `game-kit/CANONS.md` |
| `client/` | Crossade Deck client — React + Vite, imperative Pixi.js v8 table engine | `client/CLAUDE.md` |
| `server/` | Crossade Deck server — Colyseus, custom accounts | `server/CLAUDE.md` |
| `client2/` | previous client generation. **Reference only** — a behaviour benchmark and a source of test specification, not edited | `client2/docs/HANDOFF.md` |
| `deploy/`, `scripts/` | Fly.io: three apps, build and deploy are SEPARATE steps | `DEPLOY.md` |

## Working in game-kit

Entry point is `game-kit/CANONS.md` — it names every other document and says which one to open.
Do not re-derive its rules and do not ask about them again: they are owner requirements, each written
down after it was broken.

`game-kit` is not part of the Crossade Deck client. It has its own stack, its own catalog and its own
laws; nothing from `client/` or `client2/` carries over to it without being restated there.

## Version

`v<version>+<build>` (e.g. `v0.2.0+166`) — declared version from `package.json` plus the commit count
as the build number. `client/src/version.ts` and `server/src/version.ts` share the format; shown at
the bottom of the lobby, in the settings menu, and in the server's `/health`. Both packages declare
the same `version` (a test guards it) since they have separate build contexts.

## Rules for every task here

- **The Bash tool's cwd drifts back to the repo root between calls** — always `cd` into the package
  explicitly before `tsc`/`vitest`/`vite`.
- **`tsc --noEmit` and the full test run must be green before anything is called done.** A failing
  run is a rollback, not a "I'll fix it later".
- **Never push without explicit approval.** Committing per stage is fine; pushing is the owner's call.
- **A rule without a guard lives until the next context rebuild.** Every new law is born together
  with the test that enforces it, and the guard is checked by making it FAIL once.
- **Report in the form "closed / left".** "Done" only after an actual run and with numbers. Declaring
  the whole thing finished when part of it is closed is the worst thing you can hand over: a report
  without a run cannot be read without re-checking it.
- **Do not comment your own edit history in the code** ("this used to be…", names of deleted files).
  It goes stale first and misleads.
- **Fix rather than delete.** If a name or a lever is criticised, change what was criticised — do not
  remove the feature.
- **Do not add what was not asked for**, and do not narrow the ask either.

## How the owner wants me to work (in THIS repo — not a ritual on every prompt)

- **Ask at the fork, not at the start.** The global "ask 2–5 questions first" is NOT a per-prompt
  ceremony here. When the owner hands a task mid-flow ("fix this"), first go READ and investigate.
  Only when the investigation reveals a real fork — several ways to do it, and picking wrong means
  shipping garbage — stop and ask which one, BEFORE writing. If the ask is already clear, just do it.
  The question exists to avoid writing the wrong thing, not to delay starting.
- **TDD is a token-saver, not a tax.** It must HELP, never block: write the test, write the code, run
  the test, fix the code if red — so the machine checks the work instead of me burning tokens
  eyeballing it. Re-verification is running a script, not re-reading. Tests are MULTI-LEVEL: a slice
  of code → check it; a component → check it; an animation or anything visual → drive it with
  Playwright (I cannot verify motion by looking). Never hand-verify what a script can verify.
- **Match test effort to the change.** A trivial edit (swap a text "ABC" → "CDA") does not need the
  whole suite, or even the basic ones. Run what the change can actually break, nothing more.

## Night mode (autonomous run) — the protocol

- **No dialogue at night.** Do not talk, do not chew the owner's words back. Just work and commit
  continuously (per mechanic, `[skip ci]`).
- **Keep a running log on disk** — a line every ~5–10 min with a timestamp and the task closed then.
  Do NOT emit reports along the way.
- **On "status" / in the morning: ONE HTML** built from that log — what was done at each 5–10 min
  step, which tasks completed and when, with the link/anchor placed at the TOP so there is no
  scrolling up and down. Timeline first.
- **Track spend as far as it is measurable** (wall-clock, commits, tasks; subagent tokens are
  reported, main-loop tokens are not self-measurable — say so, never invent a number).
- Autonomy does not run itself: an overnight run needs an explicit wake loop (`ScheduleWakeup`/cron),
  or it is one burst then a stop. Flag this the moment "for the night / do it all yourself" is asked.

## Closing an epic: the tidy-up protocol

An epic is done when nothing is left lying around. In this order — history moves into the tickets
BEFORE the files that hold it are deleted:

1. **Fill in the epic's documentation in the TICKETS.** The epic issue is the durable home for what
   was built, why it ended up that shape, which traps were hit and how it is verified by hand. Code
   comments pointing at a design decision reference the issue number, not a file about to disappear.
2. **Delete that epic's handoff files.** `*-HANDOFF.md` is scaffolding for work in flight. Once the
   track is closed, a stale handoff is worse than none — it describes a project that no longer
   exists, and someone will follow it. History stays in the tickets and in git
   (`git log --diff-filter=D -- path`). General, epic-independent lessons move into the enduring docs.
3. **Close the epics and their sub-issues** (`gh issue close -r completed`, board → Done), with a
   comment on what was accepted, what merged and where it is deployed. Deferred epics close as
   `not planned`, noting what of them arrived anyway.
4. **Delete merged branches**, locally and on the remote. Unmerged branches are NOT deleted silently
   — report them, with what is on them and why they are still alive.
5. **Sweep the workspace**: stop dev servers started for the task, drop local build/test artefacts
   (`test-results/`, `.playwright-mcp/`), check `git status` is clean.
