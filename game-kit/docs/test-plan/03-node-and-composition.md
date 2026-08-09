## UNIT · Node and composition

`vitest (headless, no WebGL)` · 35 кейсов, расписано 34

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `node.compose.empty` | a bare `Node` | `caps(node)` is read | empty set; no capability methods on the object. A bare node is VALID |
| `node.no-element-predicate` | the whole src tree | scanned for `isElement` / an Element type | zero hits: systems ask for the atom they need, never for a category (source-scan) |
| `node.canvas-has-no-box` | the canvas root: Surfaced + Container, no Bounded | composed | legal — the surface takes its AREA from the content extent. A Surfaced→Bounded requirement would outlaw the tabletop |
| `node.no-inheritance` | the whole src tree | scanned for `extends`/`instanceof` on nodes | zero hits — composition only (source-scan) |
| `node.not-everything-is-a-node` ⏳ | slot · layout phantom · shadow · camera | asked for an id | none of them has one; they are not nodes |
| `node.transaction-is-not-a-node` ⏳ | a Transaction | asked for `z` / a shadow | a type error, not a value — it is ABOVE nodes, not one of them |
| `bounded.minimal` | a node with only `Bounded` | `caps` read | exactly [Bounded]: a place that occupies room and draws nothing |
| `compose.add-atom` | atom X is composed in | `caps(el).has(X)` | true; X's methods and events are present |
| `compose.remove-atom` | atom X is composed out | the method is called | it is **undefined** (absent), not a thrown 'disabled' error |
| `compose.assoc` | atoms a,b,c | `compose(a,compose(b,c))` vs `compose(a,b,c)` | identical caps set — composition is associative |
| `compose.commut` | the same atoms in any order | two compositions compared | equal — order does not change the node |
| `compose.dedupe` | the same atom twice | composed | present once; second is a no-op, not a duplicate |
| `node.id.given` | a node built with an authored name | its id is read | it is the name that was given — a node is NAMED, it does not name itself |
| `node.id.local-allocator` | `localIds()` in an instance answering to nobody | two ids minted | they differ; the allocator is explicit, never ambient |
| `node.id.allocators-are-independent` | two `localIds()` | first id of each | equal — which is why a module-level counter may never come back: the collision is real, and silent |
| `tree.duplicate-id-is-loud` | a tree already holding `hand` | a second `hand` is added | it throws; the rejected node gains no owner. Never a silent replace |
| `tree.duplicate-deep` | an incoming SUBTREE holding a taken id | added | it throws — the check covers the whole subtree, not its top node |
| `tree.same-id-in-another-tree` | two separate trees | each given a `hand` | both legal: uniqueness is per tree, not global |
| `locales.complete` | every catalog locale | compared to the reference bundle | no key missing — the switch is only honest with nothing left to fall back on |
| `locales.plurals` | each locale, counts 0..100 | resolved through `Intl.PluralRules` | every count lands on a form; none falls through to a raw key |
| `locales.russian-plurals` | ru, n = 1/2/5/21 | resolved | узел / узла / узлов / узел — the two-form helper that printed "узлов: 2" cannot come back |
| `locales.stops-at-the-catalog` | a resolved caption | followed | it never crosses into the kit: the scene is handed text, not a key |
| `locales.chrome-carries-no-prose` | the statically imported bundle | its keys read | not one `docs.` key: what every reader downloads must not grow with the catalog |
| `locales.a-page-loads-its-own` | one docs page opened | the loaded set read | its bundle, and nobody else's |
| `locales.a-page-falls-back-to-the-chrome` | a page's text object | asked for a toolbar caption | it answers — one object per screen, so nothing is half-swapped |
| `locales.language-is-a-separate-load` | one page, both languages | resolved | different words, cached apart: a switch is a new bundle, never a merge |
| `locales.pages-are-complete` | every page bundle, every locale | compared to its reference | no key missing — the chrome's own check cannot see these files at all |
| `locales.key-names-its-page` | a prose key | routed | the second segment names the page; an unknown one routes nowhere instead of throwing |
| `locales.an-unknown-page-is-the-chrome` | a story naming prose nobody wrote | loaded | the chrome alone: prose missing, not a page that will not open |
| `locales.every-page-has-both-languages` | every declared page | loaded in each locale | it arrives, in that locale |
| `locales.every-bundle-has-a-loader` | the pages directory | compared to the loader list | both ways: no unreachable file, no loader without a file |
| `locales.a-bundle-holds-only-its-page` | every page bundle | its keys routed | each belongs to the page it is filed under — a stray key resolves only when another page is open |
| `locales.prose-is-never-imported-statically` | every catalog source file | its imports read | a page bundle is reached by `import()` or by `import type` — one value import undoes the split |
| `locales.a-story-names-prose-that-exists` | every `gkDoc` / `gkDocStory` | looked up in its bundle | present — a key that resolves to itself renders as `docs.foo.bar` on screen |
