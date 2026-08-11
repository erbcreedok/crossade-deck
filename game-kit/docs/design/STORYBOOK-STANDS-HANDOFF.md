# HANDOFF — Storybook-стенды для механик ночной ветки

Ветка `night/2026-08-11-client2-mechanics`. Код-контракт закрыт (атомы + юниты + план + журнал), но
**витрины нет**. Владелец выбрал «Всё: стенды + play-сценарии» на каждую механику. Делаем ПО ОДНОЙ
механике полным вертикальным срезом, коммит на срез, все сторожа и `storybook build` зелёные.

## Что покрывать
**14 атомов** (под `guard.every-field-has-a-control`): Acceptor, Grabber, Displacer, Keeper, Valued,
Owned, Labeled, Placeable, Draggable, Focusable, Private, Flippable, Tiltable, Grippable.
**3 не-атома** (доко-/пресет-стенд, НЕ gkAtom): planMove (Move), actionsOf (Actions), deck (Presets).

## Ключевой факт про сторож
`guard.every-field-has-a-control` (`src/guards.test.ts:354`) перебирает `allAtoms()`, но реестр
наполняется только теми атомами, что ИМПОРТИРОВАНЫ в `guards.test.ts` (сейчас строки 17-20 — только
4 старых). Чтобы атом попал под сторож — добавить `import "./core/atoms/<x>.js";` туда. Это же
**fail-first**: импорт краснит сторож, пока не появился `gkAtom`-стенд.

## Чек-лист на один Atoms/<X> + Tests/<X> (X = PascalCase в title, x = camel в gkDoc)
1. CREATE `.storybook/stories/<X>.stories.ts` — `title:"Atoms/<X>"`, `parameters:{gkDoc:"<x>.component",
   gkAtom:"<X>", gkFields:{<field>:["<SceneOrControl>",…] на КАЖДОЕ поле def.defaults}}`. Каждая
   стори: `render:(a)=>scene(node(...)).el`, `args`, `argTypes` через `documented(key,spec,section?)`,
   `parameters:{gkDocStory:"<x>.<name>"}`. НИКАКИХ локальных хелперов в теле render (попадают в сниппет).
2. CREATE `.storybook/locales/pages/<x>/en.json` и `ru.json` — ключи `docs.<x>.component` (проза
   страницы) + `docs.<x>.<name>` на каждую стори. ОДИН И ТОТ ЖЕ набор ключей в обоих языках. Второй
   сегмент ключа == имя папки `<x>`.
3. EDIT `.storybook/locales/pages.ts` — ТРИ касания: `import type <x> from "./pages/<x>/en.json";`
   (блок 21-35); `<x>: { en:()=>import("./pages/<x>/en.json"), ru:()=>import(".../ru.json") },` (PAGES
   39-76); `typeof <x> &` в union `PageKey` (82-96).
4. EDIT `.storybook/preview.ts` — в inline-литерал `storySort.order` добавить `"<X>"` в массив детей
   `Atoms` (по ЗАВИСИМОСТЯМ, не по алфавиту) И в массив `Tests`. Литерал строкой, не идентификатором.
5. CREATE `.storybook/stories/Tests<X>.stories.ts` — `title:"Tests/<X>"`, `parameters:{gkDoc:"tests.<x>"}`.
   Стори: `parameters:{gkDocStory:"tests.<x>.<name>", controls:{include:["id"]}}`, `play:checks([{name:
   "play.<x>.<slug> — …", async run(ctx){…}}])`. Хелперы `checks/standing/settled/painted/…` из
   `../devtools/checks.js`, `scene` из `../devtools/scene.js`, `expect` из `@storybook/test`.
6. EDIT `.storybook/locales/pages/tests/en.json` и `ru.json` — `docs.tests.<x>` + `docs.tests.<x>.<name>`
   на каждую Tests-стори. Тот же набор в обоих языках. (Страница `tests` уже в pages.ts — НЕ трогаем pages.ts.)
7. EDIT `e2e/catalog.spec.ts` — в список `rungs` (`e2e.checks-run-only-when-asked`, ~948-1052) кортеж
   `["tests-<x>--<story>", ["play.<x>.<slug1>", …]]` на КАЖДУЮ Tests-стори, перечислив ВСЕ шаги play.
8. IFF новый `documented("arg.<newkey>")` — добавить ключ в `.storybook/locales/chrome/en.json` И `ru.json`
   (все `arg.*` живут в chrome, не в странице). Переиспользуем shape/record/id — пропускаем.
9. FAIL-FIRST атома: добавить `import "./core/atoms/<x>.js";` в `src/guards.test.ts` (блок 17-20) →
   `guard.every-field-has-a-control` краснеет, пока нет стенда из п.1. Оставить импорт — он и есть страховка.

## Сторожа, которые будут бить (кратко)
G1 every-field-has-a-control (нужен gkAtom+gkFields на все поля) · G2 a-story-names-prose-that-exists
(gkDoc/gkDocStory ↔ ключ локали) · G3 order.* (title-сегмент в preview.ts, порядок атомов по зависимостям)
· G4 controls.every-word-a-control-names-exists (arg.* в chrome/en) · G5/G6 полнота ru == en (chrome и
страницы) · G7 bundle-holds-only-its-page (второй сегмент ключа == папка) · G8 every-bundle-has-a-loader
(папка pages/<x> ↔ запись PAGES) · G10 prose-never-imported-statically (в pages.ts только import type /
import()) · G12 e2e rungs. `main.ts` НЕ трогать (стори глоббятся); dev-сервер рестартовать для индексации.

## КЛЮЧЕВОЙ НЮАНС: механики — чистые резолверы, к рендеру НЕ подведены
`shownFace`/`tiltAngle`/`actionsOf`/`planMove`/`grippableBy` ничего не рисуют сами. Tests-паттерн же
меряет РЕАЛЬНЫЕ пиксели (`inkOf`/`painted`/`pixelAt`). Поэтому стенд обязан САМ провести резолвер в
сцену через свой `render`:
- **Flippable**: две зарегистрированные поверхности (front/back разного цвета), контрол `faceUp:boolean`,
  `render` берёт `Surfaced({surface: shownFace(card, a.faceUp)?.surface ?? front})`. Play: щёлк faceUp →
  `inkOf` меняется. Ядро не трогаем — проводка живёт в теле стори.
- **Tiltable**: контрол `stop:number`, `render` пишет `Transformable({angle: tiltAngle(node, a.stop)})`.
- **Grippable/Private**: `render` красит узлы, видимые/поднимаемые местом `viewer`, контрол seat.
- **Move/Actions/deck**: наблюдаемы через сцену (карты колоды на столе; меню как подписи; план — до/после).
Это и есть причина «не видел механик»: контракт есть, к стеклу не подведён. Проводка в стенде — честно
и наблюдаемо, но это РАБОТА на каждый стенд, не только проза.

## Порядок работ
Flippable (образец, визуальный атом) → Tiltable → Grippable → Draggable/Focusable/Private →
Valued/Owned/Labeled/Placeable → Acceptor → Grabber/Displacer/Keeper → deck (Presets) → Actions/Move (доко).
