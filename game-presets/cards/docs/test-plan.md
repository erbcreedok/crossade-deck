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
| `classic.a-number-shows-that-many-pips` | a number card 2..10 | its face SVG | exactly `rank` pips plus the two corner marks — the pip layout is complete for every rank |
| `classic.a-court-is-framed` | J/Q/K vs a number | rects in the face | a court wears one extra panel — its centre is framed, a number's is not |
| `face.a-number-shows-that-many-pips` | a deck style, a number 2..10 | its face SVG | `rank` + 2 `<use>`s of ONE `#pip` path — no pip drawn twice |
| `face.the-ace-is-one-big-pip` | an ace | its face | one centre mark and the two corners |
| `face.a-court-wears-its-figure` | J/Q/K with its art | classic face | the figure nested at `figurePlacement`, `color` = the style's accent; only diamonds turn orange under four colours |
| `face.a-court-without-art-is-still-a-face` | a court, no art | classic face | frame and indices, nothing thrown |
| `face.minimal-is-one-index-and-one-mark` | any card, courts included | minimal face | one index, one mark, no figure |
| `face.cyrillic-is-a-label` | `cyrillic` | faces | Т В Д К, «Джокер»; numbers unchanged; keys stay Latin |
| `face.four-colours-is-one-ink-per-suit` | `fourColour` | faces | spades blue, diamonds orange, hearts red, clubs black |
| `face.the-jokers-wear-their-own-ink` | either joker, either layout | face | red or black ink, the word twice, the hat, no pips |
| `face.every-style-draws-every-card` | 8 styles × 55 cards | `faceSvg` | a document each, distinct within a style |
| `face.the-brand-card-wears-the-deck's-paper` | the brand | every style | CROSSADE over DECK in the pixel font, a red rule between; the layout's paper; never Cyrillic |
| `style.ids-round-trip` | every style | `deckStyleId` / `deckStyleOf` | speaking ids, resolving back; an unknown id is `undefined` |
| `backs.six-and-their-own` | the six backs | `backSvg` | documents; woven backs carry no crest, tiled ones do |
| `figures.twelve-courts-are-sourced` | `art/courts/` | files | J/Q/K × 4 suits, a viewBox each, `currentColor` accent, no c2pa |
| `figures.the-padded-viewbox-lands-the-ink-where-the-inline-does` | each figure | `paddedViewBox` vs `figurePlacement` | the same rect through both doors |
| `figures.the-figure-sits-inside-the-rule` | each figure | placement | inside the inset box, touching it on one axis |
| `figures.inline-keeps-the-drawing-and-sets-the-colour` | a figure | `inlineFigure` | nested svg at its placement, `color` set, drawing kept |
| `figures.a-standalone-file-carries-its-paint` | a figure | `standaloneFigure` | no `currentColor` left, viewBox padded to the paper's proportion |
| `marks.are-the-art's-own-paths` | `SUIT_MARKS`, `JOKER_HAT` | vs `art/suits/*.svg` | equal, shape for shape |
| `marks.seat-fits-whole` | a tall mark, a square box | `seat` | limited by height, centred |
| `lettering.is-rects-of-the-captured-font` | a text | `lettering` | one em per glyph, runs merged, an unknown letter throws |
| `skin.every-style-registers-every-face` | each style, both sources | `installDeckSkin` | 55 surfaces and assets, 1×1.4 units |
| `skin.raster-is-baked` | each style, each card, each back | the baked folder | a WebP file exists — `scripts/bake.ts` was run |
| `skin.vector-courts-are-two-layers` | a classic court, vector | its surface | the paper and the figure file, the figure `contain`ed |
| `skin.backs-are-their-own-slot` | the six backs | `installDeckBacks` | a surface each, no style in the name |

