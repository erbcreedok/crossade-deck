# @game-presets/dice — test plan

Laws of the add-on, each with the guard that enforces it (born fail-first). One table, grown per stage.

| id | given | when | then |
|---|---|---|---|
| `dice.resolves-the-engine` | the package | `import { node, Surfaced } from "game-kit"` | builds a surfaced node — the `development` door resolves cross-package |
| `dice.no-raw-colour` | package `src/` | scan hex/`rgb(` | none outside `textures/` — colour is a token; the faces are CSS keywords |
| `dice.kinds-are-data` | `DIE_KINDS` | `dieSpec` | d4/d6/d20 with 4/6/20 sides, each with a centred silhouette |
| `dice.every-face-has-a-picture` | each kind, each value | `faceSvg` | a `data:image/svg+xml` URI, distinct per value |
| `dice.the-skin-registers-every-face` | `installDiceSkin()` | surface + asset registries | 30 speaking names (`dice/<kind>/classic/<v>`), each with a record and a data-URI asset |
| `dice.die-builds-the-node` | `die("k", {kind: d20, at, face: 17})` | atoms; `showFace(3)`; `showFace(21)` | Bounded·Transformable·Surfaced(face 17)·Valued{kind,face}·Rollable(20)·Draggable·ShadowCaster; `showFace` writes truth AND picture; a face it has not throws |
| `dice.outcome-is-one-door` | `outcomeOf(sides, o)` | number / `{seed}` / `{rng}` / bad number | number passes as is; a seed repeats across calls; an rng is drawn once; 7 on a d6 and 0 refuse |
| `dice.roll-tumbles-and-shows-the-face` | runtime on a fake clock, `rollMs 100`, `rollDie(m, d, {outcome: 5, onFace})` | ticks | the face is decided and returned NOW; the truth and picture change when the tumble commits (after 70%); the loop sleeps at the end |
| `dice.throw-slides-and-lands-in-the-tree` | `throwDie(m, root, d, {speed 3, angle 0, spin 360, outcome: {seed 7}, onRest})` | ticks to rest | `onRest` gets the face; `Transformable.at/angle` hold the landing (it STAYED); a reconcile finds nothing to ease; the loop sleeps |
| `dice.throw-lands-in-the-owners-units` | a die inside a tray moved to x=3, `walls: wallsOf(root, tray)` | thrown, to rest | written `at` is in the TRAY's units (≈0.33, not ≈3.33) and inside the walls; the given face is shown |
| `dice.throw-from-carry-inherits-the-finger` | a carried die dragged fast; then nothing carried | `throwFromCarry` | first: it flies at the finger's speed and returns the face; second: `undefined` — a drop, not a throw |
