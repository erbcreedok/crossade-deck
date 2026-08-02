import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { Stack } from "../../game/board/stack";
import { applyStackConfig, STACK_ANCHORS, stackAt, stackState, stacksSection, type StackDemo, type StackForm } from "../../game/kit/stacks";
import type { Pose } from "../../game/ui/Card";
import { dropzonesSection } from "../../game/kit/dropzones";
import type { KitContext, KitScene } from "../../game/engine/kitScene";
import { applyArgsToParams, paramsToArgs, paramsToArgTypes } from "../harness/paramArgs";
import { STACK_ARGS, STACK_ARG_TYPES, stackOptsFrom, type StackArgs } from "./stackArgs";
import { CanvasStage } from "../harness/CanvasStage";
import { STACK_LAYOUTS, STACK_LAYOUT_IDS } from "../../game/kit/stackLayout";

// Стопки — ТА ЖЕ секция, что раздел «Стопки» на /playground (game/kit/stacks.ts).
//
// Что здесь надо проверять руками:
//   • ГРИП под стопкой уводит ВСЮ пачку; верхняя карта (справа) тянется отдельно — это две разные
//     цели захвата в одном месте, и различить их можно только пальцем;
//   • ЯКОРЬ у трёх стопок с разными политиками. Разница видна ТОЛЬКО в движении: пока пачка на
//     месте, все три выглядят одинаково. Унесите пачку и посмотрите, что осталось;
//   • РЕОРДЕР: тащите карту вдоль своей стопки — соседи расступаются под неё.
//
// Рычаги «режим драга карты» и «при драге стопки» сюда не переехали намеренно: это флаги ДЕМО
// самого движка песочницы, а не свойства стопки. Каталог показывает компонент, а не стенд.

// ——— рычаги стопки живут в ПАНЕЛИ, а не на канвасе ———
//
// Канвасные Stepper/Toggle/Segmented — для `/playground`: это стенд внутри приложения, панели у
// него нет и взять её негде. У каталога она есть, и рисовать поверх сцены второй пульт значит
// игнорировать штатный инструмент.
//
// Список рычагов берётся у САМОЙ стопки (`Stack.params()`) через мост harness/paramArgs. Поэтому
// панель не может разойтись с тем, что стопка умеет: появился параметр у компонента — появился и
// в панели, без правки этой стори.

// Живая цель правок: стори строит стопку внутри `build`, а панель дёргает её потом. Витрина в
// каталоге всегда одна (канвас один на весь сторибук), поэтому гонок тут неоткуда взяться.
/** Все рычаги применяются одинаково: влить значение в параметр компонента и переразложить сцену. */
// ——— раскладка стопки: ОДНА стопка, разные аргументы ———
//
// Каждая стори ниже — этот же render с другими args, а не своя раскладка. Витрины «все восемь
// вариантов в ряд» тут нет намеренно: сравнивать их — работа боковой навигации каталога, она для
// того и есть. Ряд из восьми уменьшенных стопок дублирует навигацию и не даёт разглядеть ни одну.
type LayoutArgs = StackArgs;

// id расставленных карт — их знает только сборка, поэтому она их сюда и кладёт. Витрина в
// каталоге одна (канвас один на весь сторибук), гонок тут неоткуда взяться.
let liveIds: string[] = [];

const meta: Meta<LayoutArgs> = {
  title: "UI-kit/Stack",
  parameters: {
    code: (a: Record<string, unknown>) => `import { stackState } from "../../game/kit/stacks";

// Раскладка стопки — три независимые оси: ЧТО ВИДНО (faceUp), КАК ЛЕЖИТ (form), ГДЕ ЛЕЖИТ (rest).
const { ids } = stackState(ctx, { x, y }, ${JSON.stringify(a, null, 2)});

// Перевернуть ПАЧКУ — своя операция, не N одиночных флипов: у неё расписание и, возможно,
// разворот порядка (anim/flipSchedule.ts). Что именно произойдёт, решает пресет.
ctx.flipStack(ids);`,
  },
  argTypes: STACK_ARG_TYPES,
  args: { ...STACK_ARGS },
  // Геометрия и состав — пересборка: пружиной «переехать» из тонкой стопки в веер нельзя, у веера
  // другой набор домов И поворотов.
  //
  // А вот «лицом вверх» — НАСТОЯЩИЙ переворот пачки, через общий flipGroup. Пересборка показала бы
  // мгновенную смену стороны, которой в игре не бывает; и обратите внимание, что вместе со
  // стороной разворачивается ПОРЯДОК — базовый пресет переворачивает пачку как предмет. Как это
  // настроить — раздел «Пресеты анимации».
  render: (args) => (
    <CanvasStage<KitScene, LayoutArgs>
      args={args}
      apply={{ faceUp: (scene) => void scene.flipStack(liveIds) }}
      target={(scene) => scene}
      build={(ctx, a) => {
        const r = stackState(ctx, { x: ctx.padding, y: ctx.padding }, stackOptsFrom(a));
        liveIds = r.ids;
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<LayoutArgs>;

/**
 * Стопка. Всё крутится рычагами: раскладка (направление, шаг, доворот, размах веера), чем вверх,
 * поза покоя, выделение, количество.
 *
 * Отдельных страниц под «закрытую», «раскрытую», «веер» тут нет: их различают ЧИСЛА одной и той же
 * раскладки. Колода — это `linear` с шагом 0.06, столбец Косынки — она же под 90°, ряд — она же с
 * шагом 1.12. Заводить под каждое сочетание свою страницу — то же, что заводить страницу под
 * каждый цвет кнопки.
 *
 * `faceUp` — НАСТОЯЩИЙ переворот пачки через общий `flipGroup`, а не пересборка с другой стороной.
 * Вместе со стороной разворачивается ПОРЯДОК: базовый пресет переворачивает пачку как предмет.
 */
export const Default: Story = {};

/**
 * ГАЛЕРЕЯ РАСКЛАДОК — все готовые имена реестра разом, с подписью под каждой.
 *
 * Отдельной страницей: на странице стопки крутят ОДНУ раскладку рычагами, а тут выбирают из
 * готовых. Имена — не отдельные сущности: каждое это `linear`/`fan`/`heap` с разными числами
 * (kit/stackLayout.ts), и видно это только рядом.
 */
export const Gallery: Story = {
  parameters: {
    controls: { disable: true },
    code: () => `import { STACK_LAYOUTS, resolveLayout } from "../../game/kit/stackLayout";
import { STACK_LAYOUTS, STACK_LAYOUT_IDS } from "../../game/kit/stackLayout";
import { stackState } from "../../game/kit/stacks";

// Имя → функция раскладки; сама стопка одна и та же.
for (const [id, { label }] of Object.entries(STACK_LAYOUTS)) {
  stackState(ctx, at(id), { form: id, count: 5 });
  ctx.label(label, x, y, 12, 0x9aa89f);
}`,
  },
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 110 }}
      build={(ctx) => {
        // Ячейка — по САМОЙ ШИРОКОЙ раскладке: «ряд» без нахлёста это 1 + (n−1)×1.12 карты, и на
        // глазок подобранная ширина оставляла его наезжать на соседа.
        const count = 4;
        const cols = 3;
        const cellW = ctx.cardW * (1 + (count - 1) * 1.12 + 0.5);
        const cellH = ctx.cardH * 2.4;
        let bottom = ctx.padding;
        STACK_LAYOUT_IDS.forEach((id, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const at = { x: ctx.padding + col * cellW, y: ctx.padding + row * cellH };
          const r = stackState(ctx, at, { form: id, count }, `gal-${id}`);
          const cap = ctx.label(STACK_LAYOUTS[id]!.label, at.x, r.bottom + 10, 12, 0x9aa89f, cellW * 0.92, 0);
          bottom = Math.max(bottom, r.bottom + 10 + cap.height);
        });
        ctx.extent(ctx.padding * 2 + cols * cellW, bottom + ctx.padding);
      }}
    />
  ),
};
