## UNIT · four classes of inheritance

`vitest + a fake tree` · 26 кейсов, расписано 10

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `inherit.own.not-inherited` | owner has `size`, child does not | the child's size resolved | undefined — an 'own' field never travels down |
| `inherit.owner.nearest` | a child without `orientation`, a grandparent that has it | resolved | the NEAREST set value up the chain wins |
| `inherit.owner.override` | child sets its own `orientation` | resolved | the child's value wins over the owner's |
| `inherit.sum.adds` | own z=2, owner z=1, root z=1 | resolved | 4 — sums the whole chain, not just the parent |
| `inherit.sum.cannot-cancel` | child tries to zero the inherited angle | resolved | impossible by construction: only its own term is authored |
| `inherit.sum.skips-the-silent` | an owner with no `Transformable` at all | a child's z resolved | only the child's own term — a node that never spoke contributes nothing |
| `inherit.root-only.absent` ⏳ | a child asked for `light` / `camera` | the field read | it does not EXIST on a child — a validator error, not undefined |
| `inherit.class-declared` | every field in the model | its class looked up | all four classes covered; a field with no class fails the scan (source-scan) |
| `inherit.billboard-terminates` | child `orientation: viewer`, owner rotated 45° | angle resolved | own − camera.rotation; the owners' 45° is NOT added — viewer terminates the chain |
| `inherit.shadow-ignores-angle` ⏳ | the node rotated | the shadow inspected | the silhouette turns, the offset does not: the shadow never inherits the rotation matrix |
