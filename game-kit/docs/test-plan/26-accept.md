## UNIT · AcceptRule — the zone's predicate

`vitest` · 20 кейсов, расписано 20

Сериализуемый предикат-ДАННЫЕ, один механизм на приём-в-зону. Вердикт трёхзначный
(`allow`/`deny`/`ask`), edet в мультиплеер как данные. Дизайн — `docs/design/container.md`.

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `accept.can-reads-a-capability` | `{ can: "flip" }`, элемент со способностью и без | вердикт посчитан | есть способность — `allow`, нет — `deny`; самый устойчивый предикат, не привязан к сорту |
| `accept.has-reads-a-trait` | `{ has: "card" }`, черта есть и нет | вердикт посчитан | `allow`/`deny` по плоской черте — честно, когда игра про сорт |
| `accept.flag-reads-runtime-state` | `{ flag: "eaten" }` | вердикт посчитан | правдивое значение → `allow`, ложное/отсутствует → `deny`; состояние тем же механизмом |
| `accept.eq-and-lt-over-paths` | `eq`/`lt` над `el.values.rank`, `target.count` | вердикт посчитан | значение и отношение карточных правил: равно/меньше → `allow`, иначе `deny` |
| `accept.eq-compares-two-paths` | `eq: [el.values.suit, target.top.values.suit]` | вердикт посчитан | сравнение двух путей — масть элемента против верха стопки |
| `accept.string-literal-vs-path` | `eq: [el.values.suit, "hearts"]` | вердикт посчитан | голое слово — литерал; только префикс `el.`/`target.` читается как путь |
| `accept.missing-path-denies` | сравнение с полем, которого нет | вердикт посчитан | `deny`, не `ask` и не ошибка: отказ выглядит как молчание |
| `accept.empty-pile-top-is-missing` | `target.top.*` над пустой стопкой; и вариант через `target.count` | вердикт посчитан | верха нет → путь отсутствует → `deny`; «пустая принимает туза» пишется через счёт |
| `accept.and-deny-dominates` | `and` с одним `deny`; и пустой `and` | вердикт посчитан | `deny` топит конъюнкцию; пустой `and` пускает всё |
| `accept.or-allow-dominates` | `or` с одним `allow`; и пустой `or` | вердикт посчитан | `allow` поднимает дизъюнкцию; пустой `or` не пускает никого |
| `accept.ask-survives-to-a-request` | `{ ask: … }`, внутреннее allow и deny | вердикт и `needsRequest` | внутренний `deny` остаётся `deny`; иначе `ask`, и запрос рождается только если `ask` дожил |
| `accept.preview-treats-ask-as-allow` | тот же `ask` | `previewAllows` | превью показывает приём (`ask` читается как да); плоский `deny` всё равно нет |
| `accept.not-flips-allow-and-deny` | `{ not: { can } }` | вердикт посчитан | обычная негация над формой: allow↔deny |
| `accept.not-over-ask-is-refused` | `not` над тем, что может `ask` | `validateRule` | бросок: «не спрашивать» смысла не имеет — ошибка сборки, не сюрприз рантайма |
| `atom.acceptor.needs-the-atom` | контейнер без `Acceptor` | `canAccept` | `deny`: нет судьи — нет входа, отсутствие и есть выключатель, не бросок |
| `atom.acceptor.default-accepts-all` | `Acceptor()` без правила | `canAccept`/`wouldAccept` | пустой `and` → `allow`: зона сужает установкой правила, голый Acceptor — открытая дверь |
| `atom.acceptor.reads-the-childcount` | `lt: [target.count, 2]`, реальные дети | `canAccept` | счёт берётся из настоящих детей дерева: 1 → allow, 3 → deny |
| `atom.acceptor.can-reads-node-caps` | `{ can: "Bounded" }`, узел с атомом и без | `canAccept` | способности элемента читаются с дерева: есть Bounded → allow, голый узел → deny |
| `accept.a-rule-can-read-the-actors-seat` | правило `{eq: ["actor.seat","target.owner"]}` | тот же ход от владельца и от чужого | `allow` · `deny`. Без этих двух путей «своя рука берёт, чужая спрашивает» вообще не пишется ПРАВИЛОМ, и разница уехала бы в рантайм, где перестаёт ехать и перестаёт быть общей |
| `accept.an-unsaid-actor-is-missing-not-empty` | тот же ход без актора | `evaluate` | `deny`: несказанное — это отсутствующий путь, а не пустая строка |
