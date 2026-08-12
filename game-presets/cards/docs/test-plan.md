# @game-presets/cards — test plan

Laws of the add-on, each with the guard that enforces it (born fail-first). One table, grown per stage.

| id | given | when | then |
|---|---|---|---|
| `cards.resolves-the-engine` | the package | `import { node, Surfaced } from "game-kit"` | builds a surfaced node — the `development` door resolves cross-package |
| `cards.no-raw-colour` | package `src/` | scan hex/`rgb(` | none outside `textures/` — colour is a token or a `spin` param |
| `suits.four-are-named` | `SUITS` | names | spade, heart, diamond, club, and no fifth |
| `suits.shapes-are-finite` | each suit | `outlineOf` | >2 real points, every coord finite |
| `suits.reds-spin-blacks-ink` | each suit | paint | red → `spin`, black → `text`; reds are heart+diamond |
| `suits.by-name` | a name | `suitByName` | resolves, or `undefined` for a dangling name (never throws) |
