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
| `crossade.is-fifty-five` | `crossade()` | length | 55 |
| `crossade.two-jokers-one-brand` | the set | counts by kind | 52 pip / 2 joker / 1 brand; brand label "crossade deck" |
| `crossade.fields-are-typed` | each card | its values | every field declared in `CROSSADE_FIELDS`, value in the field's order |
| `crossade.ids-are-unique` | the set | ids | no repeat |
| `crossade.pip-colour-follows-suit` | each pip | colour | red for heart/diamond, black for spade/club |
| `classic.every-spec-face-resolves` | installed skin | each of 55 + back | a surface AND an asset registered |
| `classic.assets-declare-unit-size` | card assets | w,h | 56 assets, each 1×1.4, never zero |
| `classic.textures-are-sourced` | card assets | src | self-contained `data:image/svg+xml,` — the add-on's own art |
| `cards.builds-fifty-five-nodes` | `cards()` | length | 55 nodes |
| `cards.each-turns-over` | each node | Flippable | `turnOver`, back = the shared back surface |
| `cards.values-are-typed` | each node | Valued | equals the set's typed fields, in order |
| `cards.ids-are-unique` | the nodes | ids | no repeat |
| `cards.faces-resolve` | each node | Surfaced + skin | face is a registered surface, node is Bounded |
| `shuffle.keeps-every-item` | a list | `shuffled` | a permutation — same multiset, same length, nothing added or dropped |
| `shuffle.does-not-mutate-the-input` | a list | `shuffled` | the source keeps its order; the result is a new array |
| `shuffle.is-deterministic-under-a-seeded-rng` | a seeded rng | `shuffled` | same rng → same permutation; `() => 0` gives a known non-identity order |
