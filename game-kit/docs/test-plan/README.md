# game-kit — план тестов

Покрытие. Спецификация ПОВЕДЕНИЯ — `docs/scenarios/*.md`, законы — `CANONS.md`; здесь то, что
именно проверяется и на каком слое. Каждый закон обязан иметь тут строку: правило без сторожа
живёт до первой пересборки контекста (§0 канонов).

Идентификатор — `scope.scenario.condition`, стабильный: по упавшему id сразу видно сценарий и
состояние. Строка — Дано / Когда / Тогда.

**59 слоёв · 1371 кейсов заявлено · 1198 расписано поимённо.**
Разница — однотипные варианты внутри кейса (значения перечислений, темы, вьюпорты); слой не
закрыт, пока не расписаны все, а пропущенное называется явно (`matrix.dropped`).

**Слой на файл, и читают ОДИН.** План — справочник, а не повесть: работая над контейнером, открывают
`09-container.md`, и остальные двадцать четыре слоя не нужны. Целиком он не читается никогда —
поэтому единого файла и нет. Порядковый номер в имени держит лестницу: слои идут от юнитов к
браузеру, а алфавит перемешал бы их.

**Строка отвечает на «что покрыто», а не на «почему так».** Обоснование живёт в шапке ТЕСТА, рядом с
кодом, который его исполняет: там его находит тот, кто правит проверку, и оно не может разойтись с
ней незаметно. Раньше «почему» писали сюда, и в старых строках оно ещё лежит — при следующей правке
такой строки объяснение переезжает в тест, а здесь остаётся Дано / Когда / Тогда.

> Данные плана и таблица в сторибуке — ОДИН массив: этот каталог из него выгружен, а когда появится
> настоящий Storybook, стори будет читать эти файлы. Двух источников нет по построению.

| слой | чем гоняется | заявлено | расписано |
|---|---|---|---|
| [UNIT · Fit and align](01-fit-and-align.md) | `vitest (headless, no WebGL)` | 12 | 12 |
| [UNIT · Contour and dashes](02-contour-and-dashes.md) | `vitest (headless, no WebGL)` | 20 | 20 |
| [UNIT · Node and composition](03-node-and-composition.md) | `vitest (headless, no WebGL)` | 37 | 36 |
| [UNIT · Root, host and the inspector](04-root-host-and-inspector.md) | `vitest + a DOM fake` | 29 | 28 |
| [UNIT · requirement chains](05-requirement-chains.md) | `vitest` | 10 | 6 |
| [UNIT · four classes of inheritance](06-inheritance-classes.md) | `vitest + a fake tree` | 26 | 10 |
| [UNIT · ResolveContext](07-resolve-context.md) | `vitest + a fake clock` | 12 | 4 |
| [UNIT · per-atom contract](08-per-atom-contract.md) | `vitest` | 103 | 102 |
| [UNIT · Container — slot, layout, spreading](09-container.md) | `vitest` | 105 | 93 |
| [UNIT · the scene plan](10-scene-plan.md) | `vitest (headless, no WebGL)` | 59 | 59 |
| [UNIT · оболочка каталога](11-catalog-shell.md) | `vitest + jsdom` | 64 | 64 |
| [UNIT · the two measures](12-two-measures.md) | `vitest` | 8 | 5 |
| [UNIT · границы по сетке](13-zombies-correct-grid.md) | `vitest` | 15 | 15 |
| [PROPERTY-BASED](14-property-based.md) | `fast-check` | 14 | 5 |
| [ARCHITECTURAL GUARDS · source-scan](15-architectural-guards.md) | `vitest + fs scan (like argNames.test.ts)` | 33 | 33 |
| [INTERACTION · play functions](16-interaction-play.md) | `@storybook/test + userEvent, Vitest browser mode` | 107 | 102 |
| [STATE MATRIX · combinatorics](17-state-matrix.md) | `generated table, vitest` | 24 | 5 |
| [STATE PLANE · what happens vs what is authored](18-state-plane.md) | `vitest` | 12 | 4 |
| [VISUAL REGRESSION](19-visual-regression.md) | `Chromatic — pixel diff per story` | 40 | 4 |
| [ACCESSIBILITY](20-accessibility.md) | `axe-core via the a11y addon` | 14 | 4 |
| [NETWORKING · truth vs pretty](21-networking.md) | `vitest + a fake Colyseus room + a fake clock` | 24 | 6 |
| [LIFECYCLE & PERFORMANCE](22-lifecycle-and-performance.md) | `vitest + a headless Pixi fake` | 21 | 10 |
| [SERIALIZATION / SCHEMA CONTRACT](23-serialization.md) | `vitest` | 11 | 4 |
| [REGRESSION GUARDS · known traps](24-regression-guards.md) | `vitest — one test per historical bug` | 10 | 6 |
| [E2E](25-e2e.md) | `Playwright against the built Storybook` | 47 | 47 |
| [UNIT · AcceptRule — the zone's predicate](26-accept.md) | `vitest` | 20 | 20 |
| [UNIT · Container policies — grab · occupied · keeps](27-container-policies.md) | `vitest` | 15 | 15 |
| [UNIT · Element data atoms — Valued · Owned · Labeled · Placeable](28-element-atoms.md) | `vitest` | 6 | 6 |
| [UNIT · Interaction & visibility atoms — Draggable · Focusable · Private](29-interaction-atoms.md) | `vitest` | 9 | 9 |
| [UNIT · Flippable — the card turn](30-flippable.md) | `vitest` | 44 | 44 |
| [UNIT · Tiltable — the card tap](31-tiltable.md) | `vitest` | 13 | 13 |
| [UNIT · Actions — the verb follows the capability](32-actions.md) | `vitest` | 8 | 8 |
| [UNIT · Grippable — whose hands may lift it](33-grippable.md) | `vitest` | 6 | 6 |
| [UNIT · Move — the whole drop as one plan](34-move.md) | `vitest` | 24 | 24 |
| [PRESET · Deck — a set expanded into cards](35-deck.md) | `vitest` | 10 | 10 |
| [UNIT · the effects list — the runtime seam](36-effects.md) | `vitest` | 5 | 5 |
| [UNIT · paint — the colour as data](37-paint.md) | `vitest` | 6 | 6 |
| [UNIT · Coated — the runtime coat over a surface](38-coated.md) | `vitest` | 34 | 34 |
| [UNIT · flips — the registry and the flip effect](39-flips.md) | `vitest` | 15 | 15 |
| [UNIT · motion — the settle clock](40-motion.md) | `vitest + a fake clock` | 31 | 31 |
| [UNIT · pointer — glass, units and the pick](41-input.md) | `vitest (headless, no WebGL)` | 10 | 10 |
| [UNIT · drag feel — the spring and the carry styles](42-drag-feel.md) | `vitest (headless, no WebGL)` | 13 | 13 |
| [UNIT · ShadowCaster и Lit — тень и единственный свет](43-shadow-and-light.md) | `vitest` | 8 | 8 |
| [UNIT · Inviting — приглашение готовой зоны](44-inviting.md) | `vitest` | 3 | 3 |
| [PRESET · Pile — стопка одним литералом данных](45-pile.md) | `vitest` | 4 | 4 |
| [UNIT · launch и slide — баллистика на одних часах](46-launch-and-slide.md) | `vitest + a fake clock` | 15 | 15 |
| [UNIT · тасовка и кувырок — истина, случай, хореография](47-shuffle-and-roll.md) | `vitest + a fake clock` | 17 | 17 |
| [UNIT · Rollable — грань как истина, кувырок как вид](48-rollable.md) | `vitest` | 3 | 3 |
| [UNIT · текст — линейка портом, раскладка чистой функцией](49-text.md) | `vitest (headless, no font engine)` | 13 | 13 |
| [UNIT · контролы — `Pressable`, пресет `button`, проводка](50-controls.md) | `vitest` | 31 | 31 |
| [UNIT · пыль цензуры — облако без единого пикселя](51-censor-dust.md) | `vitest (headless, no WebGL)` | 21 | 21 |
| [UNIT · камера — как на холст смотрят](52-camera.md) | `vitest (headless, no renderer)` | 28 | 28 |
| [UNIT · руки на столе — жесты камеры и арбитраж](53-camera-input.md) | `vitest (headless, no renderer)` | 13 | 13 |
| [UNIT · грани позы покоя — что зона делает с прилетевшим](54-pose-grains.md) | `vitest` | 28 | 28 |
| [UNIT · проекция места — что показывают одному зрителю](55-seat-projection.md) | `vitest` | 12 | 12 |
| [UNIT · ход, ждущий человека — запись, замок и второй суд](56-pending.md) | `vitest` | 8 | 8 |
| [CATALOG · локальный мастер — семантика доставки](57-local-master.md) | `vitest + фейковые таймеры` | 16 | 16 |
| [UNIT · расступание — щель под палец](58-parting.md) | `vitest` | 8 | 8 |
| [UNIT · два корня — холст едет, HUD не едет](59-two-roots.md) | `vitest + jsdom` | 17 | 17 |
