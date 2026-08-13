# @game-presets/solitaire — test plan

Laws of the add-on, each with the guard that enforces it (born fail-first). One table, grown per stage.

| id | given | when | then |
|---|---|---|---|
| `solitaire.resolves-the-engine` | the package | `import { node, Surfaced } from "game-kit"` | builds a surfaced node — the `development` door resolves cross-package |
| `solitaire.no-raw-colour` | package `src/` | scan hex/`rgb(` | none outside `textures/` — colour is a token or a `spin` param |
| `rules.rank-is-ace-to-king` | `rankNum` | A, "10", K, an unknown rank | 1, 10, 13, and -1 for a rank the set does not use |
| `rules.tableau-empty-takes-a-king` | `canOnTableau(x, undefined)` | x is a King / not a King | true only for a King |
| `rules.tableau-descends-in-alternating-colour` | `canOnTableau` | red 6 onto black 7 / same colour / non-adjacent rank | true only when colour alternates and rank is one down |
| `rules.foundation-empty-takes-an-ace` | `canOnFoundation(x, undefined)` | x is an Ace / not an Ace | true only for an Ace |
| `rules.foundation-ascends-by-suit` | `canOnFoundation` | 2♠ onto A♠ / wrong suit / non-adjacent rank | true only when suit matches and rank is one up |
| `rules.a-run-is-descending-alternating` | `isRunOrdered` | a valid run / a colour repeat / a rank gap / a single card / an empty run | true for valid, single, and empty; false on a colour repeat or a rank gap |
| `rules.value-reads-typed-fields` | `valueOf` | a full record / a missing record / a wrong-typed field | `{suit,rank,colour}`, or `undefined` |

The add-on ships two doors, mirroring game-kit: `.` (pixi-free model — rules plus `buildBoard`) and
`./pixi` (the interactive mount, `startSolitaire`). The board and scene have no unit tests of their
own — Pixi and pointer interaction are not headless-testable — and are exercised by the `client3`
demo instead.
