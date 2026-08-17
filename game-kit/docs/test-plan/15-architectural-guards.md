## ARCHITECTURAL GUARDS · source-scan

`vitest + fs scan (like argNames.test.ts)` · 31 кейсов, расписано 31

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `order.every-title-is-placed` | все стори каталога | сегменты титулов сверены со списком `storySort` | каждый назван. Неназванный не падает, а СОРТИРУЕТСЯ — каталог с неверным порядком неотличим от верного до первого читателя |
| `order.basics-before-atoms` | список порядка | прочитан из исходника `preview.ts` | `Basics` раньше `Atoms`: вопросы прежде ответов |
| `order.atoms-follow-the-dependencies` | тот же список | позиции ступеней сверены | `Bounded → Surfaced → Transformable → Container`. По алфавиту вышло бы `Container` раньше того, что он раскладывает |
| `order.no-stale-levels` | тот же список | имена сверены с существующими уровнями | ни одного имени с уровня, которого больше нет — прошлый список был плоским, и внутри `Start` дерево молча вернулось к алфавиту |
| `guard.every-field-declares-a-class` | все зарегистрированные атомы | классы полей прочитаны из реестра | у каждого поля объявлен один из четырёх классов. НЕ скан: атом, собранный в рантайме, скану не виден |
| `guard.layout-writes-only-at` | все поставляемые раскладки | позы прочитаны | ключи ровно `x,y` — раскладка двигает, но не поднимает |
| `guard.catalog-through-the-door` | каталог | импорты в `src/` просканированы, включая динамические | только две двери: модель (`index.ts`) и рендерер (`render/pixi.ts`) |
| `guard.no-kind` | the whole src tree | scanned for `def.kind ===` / kind switches | zero hits outside the visual registry |
| `guard.no-negation` | the whole src tree | scanned for `disabled` / `interactive:"none"` / `transparent` | zero hits — capability is by presence, restriction by absence |
| `guard.caps-only-door` ⏳ | systems code | scanned for direct `def.flip/def.drag/...` | zero — only `elementCaps` may read them |
| `guard.no-parent-namespace` ⏳ | the whole src tree | scanned for `parent.` as a field path | zero — an owner's fields are ordinary fields of another node |
| `guard.three-planes` ⏳ | every story in the catalog | its controls classified | Controls holds only fields; State holds nothing serializable as spec; Viewer writes no state |
| `guard.english-only` | identifiers & comments | scanned for Cyrillic | zero outside `locales/` — the bundles and the test asserting what they say |
| `guard.kit-knows-no-localization` | the kit tree | scanned for locale/i18n/TextSource/translate and json imports | zero: not the words, and not the notion either — a caption arrives already written |
| `guard.no-language-list` | the kit tree | scanned for "en"/"ru" literals | zero — a game adding a language must never have to edit the kit |
| `guard.view-not-canvas` | всё дерево исходников | скан | ни одного `HTMLCanvasElement` под именем canvas |
| `guard.one-clock` | всё дерево `src` (каталог не в счёт) | скан на `requestAnimationFrame`/`setInterval`/`setTimeout` | ровно один файл — `render/animator.ts`. Второй кадровый цикл это вторые часы, а двое часов расходятся |
| `guard.id-is-opaque` | всё дерево | скан на `id ===` и разбор идентификатора | ноль. client1 умер от обратного: `id === "deck"` по всему движку |
| `guard.no-font-shorthand` | tsx каталога | скан на `font:` | ноль: собранное из токенов сокращение не применяется и НЕ сообщает об ошибке — элемент молча наследует шрифт страницы |
| `guard.docs-prose-is-translated` | стори каталога | скан на `description: {` | ноль: встроенная проза попадает в индекс на сборке и языку уже не подчиняется |
| `guard.no-pixels-in-spec` | дерево кита | скан на `\d+px` | ноль вне хоста: размеры в юнитах, пиксели знает только стекло |
| `guard.no-raw-colour` | всё дерево | скан на hex и `rgb(` | ноль вне `theme.ts`. client2 умер от обратного: 261 сырой цвет против ~20 чтений темы |
| `guard.one-accent` | каждая палитра | посчитаны акценты | ровно один. Оттенки ВЫВОДЯТСЯ, вторым hex не объявляются |
| `guard.coat-not-viewer` | `render/coats.ts` | скан на `viewer` | ноль: coat — общий стейт, не onlooker-канал; приват — спроецированное поле, не флаг |
| `guard.no-desk-called-table` | код и бандлы | скан на «table» как мебель | ноль: стол — Desk, а table значит таблицу и ничего больше |
| `guard.every-field-has-a-control` | каждый зарегистрированный атом | сверен с `gkFields` каталога | у каждого поля есть контроль или своя сцена. Именно это правило каталог и нарушил: `Surfaced` объявлял три поля и предлагал одно |
| `guard.spec-holds-no-functions` | `core/atom.ts` | прочитан | проверка есть и в рантайме: значение, собранное на лету, скану не видно |
| `guard.no-ambient-id-source` | the whole src tree | scanned | no module counter in `node.ts`, no `resetIds` anywhere (source-scan) |
| `guard.layering` | every source file | КАЖДЫЙ относительный импорт разрешён до папки | вниз по лестнице и только: core→core, render→core, presets→render/core. Тест — ПОТРЕБИТЕЛЬ и стоит над всеми (source-scan) |
| `guard.public-api` | `src/index.ts` | scanned for the names a consumer needs | all present: a standalone imports "game-kit", never a path into src (source-scan) |
| `guard.every-tuning-field-has-a-control` | `DEFAULT_TUNING` и стенд `Engine/Motion` с `gkTuning: {поле → стори}` | скан ключей и args стенда | множество ключей `gkTuning` == множество полей тюнинга; каждая названная стори существует; каждое поле объявлено args'ом стенда ПОД СВОИМ ИМЕНЕМ — число фила без контрола есть константа в маскировке |
