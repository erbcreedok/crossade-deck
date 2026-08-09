## STATE PLANE · what happens vs what is authored

`vitest` · 12 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `state.pose-authorable` ⏳ | rest · lifted · held | assigned from a spec | accepted — these three are a pose |
| `state.happens-not-authorable` ⏳ | drag · flying · settling | assigned from a spec | rejected by the validator: they happen to the node, they are not written |
| `state.idle-not-z` ⏳ | idle breathing on | z and the shadow measured | z unchanged, shadow unchanged in size — breathing is decoration (client2 elevation.ts:21) |
| `state.flags-independent` ⏳ | selected · focused · concealed · frozen | toggled in every order | independent; none of them adds or removes an atom |
