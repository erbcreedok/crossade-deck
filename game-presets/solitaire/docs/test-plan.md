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
| `deal.the-whole-deck-starts-in-the-stock` | `buildBoard()` | before dealing | 52 in the stock, tableau/waste/foundations empty — undealt, ready to fly |
| `deal.columns-cascade-one-to-seven` | `dealKlondike` | the deal | column i holds i+1 cards |
| `deal.only-the-column-top-is-face-up` | a dealt column | facing | the last card up, the rest down |
| `deal.the-rest-stays-in-the-stock-face-down` | after the deal | the stock | 24 left, all face-down; 28 dealt + 24 = 52, nothing lost |

The add-on ships two doors, mirroring game-kit: `.` (pixi-free model — rules, `buildBoard` and the
`dealKlondike` deal) and `./pixi` (the interactive mount, `startSolitaire`). The DEAL is headless —
counts and facing are deterministic whatever the shuffle — so it is tested above; the SCENE (Pixi and
pointer interaction, the fly-in glide and the flip) is not headless-testable and is exercised by the
`client3` demo and the engine's own motion tests instead.
