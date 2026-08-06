import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeckStage, LiveTwoStage, TwoStage, type DeckArgs, type LiveTwoArgs, type TwoArgs } from "./hudDockStages";
import { FlexStage, RegionsStage, type FlexArgs, type RegionArgs } from "./hudStages";

// HUD — ОДНА секция «Механики»: экранный слой виджетов ПОВЕРХ борды, layout-система КАК ДАННЫЕ
// (список областей: регионы краёв + пины; hud/hudLayout). Все стори живут здесь плоско; сцены и
// спеки — в hudStages/hudDockStages (лимит 300 строк на файл).

const meta: Meta<FlexArgs> = {
  title: "Mechanics/Hud",
  parameters: {
    layout: "fullscreen",
    code: () => `import { BoardScene } from "game/boards/scene/scene";
import { handZone } from "game/boards/library/strips";
import { region, pin, zoneW, placeholderW } from "game/boards/core/hudSpec";
import type { BoardSpec } from "game/boards/core/spec";

// HUD — layout-система КАК ДАННЫЕ: список ОБЛАСТЕЙ (регионы краёв + пины).
// Регион = {side, slot: start|center|end}; углы по владельцам (corners) — наплывов нет.
// Любая strip-зона швартуется виджетом zoneW(id); без виджета — на борде.
const spec: BoardSpec = {
  ...myBoard,
  zones: [...myBoard.zones, handZone()], // рука — strip-зона «hand»; мешок — ещё strip-зона

  hud: { areas: [
    region("bottom", "start", [
      zoneW("hand", "auto"),          // auto = доля свободного лейна
      placeholderW("реакции", 220),   // px-константа
    ], { gap: 10, inset: 12 }),       // inset — дальность от края (поверх safe)
    region("top", "end", [placeholderW("профиль", 180)]), // прижим = ВЫБОР региона
    pin("bottom-right", [zoneW("pouch", 72)], { offset: { x: -8, y: -90 } }), // фикс-позиция
  ] },
};
// Safe-zone устройства — рычаг ДВИЖКА (не HUD): хост читает поля платформы и кормит сцену.
const scene = new BoardScene({ spec, seats: 2, safeArea: { top: 0, bottom: 34, left: 0, right: 0 } });
void scene.mount(host, width, height);
scene.setSafeArea({ top: 47, bottom: 21, left: 0, right: 0 }); // живо: поворот экрана
// Живая миграция: тот же spec с другим hud — жители ПЕРЕЛЕТАЮТ (ноды те же).
scene.applySpec({ ...spec, hud: { areas: [region("right", "start", [zoneW("hand")])] } });`,
  },
  args: { handSide: "bottom", handSize: "auto", reactionsWidth: 220, gap: 10, profileJustify: "end", dockInset: 0, safeBottom: 0, safeTop: 0, safeSide: 0 },
  // Панель разделена: свойства HUD-ДОКА (spec.hud) отдельно от РЫЧАГОВ ДВИЖКА (safe-zone сцены).
  argTypes: {
    handSide: { table: { category: "HUD-док" }, description: "край области руки (реакции едут с ней); top делит верх с «профилем» без конфликтов", control: { type: "inline-radio" }, options: ["bottom", "top"] },
    handSize: { table: { category: "HUD-док" }, description: "длина области руки: auto — вся доля свободного лейна; 320/480 — px-константа (рука сжимается, лейн пустеет)", control: { type: "inline-radio" }, options: ["auto", 320, 480] },
    reactionsWidth: { table: { category: "HUD-док" }, description: "px-константа виджета «реакции»: рука ужимается, константа держится", control: { type: "range", min: 80, max: 480, step: 20 } },
    gap: { table: { category: "HUD-док" }, description: "зазор между виджетами дока", control: { type: "range", min: 0, max: 40, step: 2 } },
    profileJustify: { table: { category: "HUD-док" }, description: "регион «профиля» у верхнего края: прижим — выбором региона start/center/end", control: { type: "inline-radio" }, options: ["start", "center", "end"] },
    dockInset: { table: { category: "HUD-док" }, description: "дальность дока от края (HudDock.inset), ПОВЕРХ safe-zone", control: { type: "range", min: 0, max: 64, step: 4 } },
    safeBottom: { table: { category: "Сцена (движок): safe-zone" }, description: "низ (home-индикатор): scene.setSafeArea — у каждого устройства свои поля", control: { type: "range", min: 0, max: 60, step: 4 } },
    safeTop: { table: { category: "Сцена (движок): safe-zone" }, description: "верх (чёлка)", control: { type: "range", min: 0, max: 60, step: 4 } },
    safeSide: { table: { category: "Сцена (движок): safe-zone" }, description: "бока (лендскейп-вырез)", control: { type: "range", min: 0, max: 60, step: 4 } },
  },
  render: (a) => <FlexStage {...a} />,
};
export default meta;

/**
 * Флекс-площадка областей: рука (auto-доля) + «реакции» (px) внизу, «профиль» сверху (регион по
 * profileJustify). Панель — две категории: HUD (данные spec.hud) и Сцена/движок (safe-zone).
 */
export const FlexDocks: StoryObj<FlexArgs> = {};
/** Гасит контролы меты (FlexArgs) у стори с другим набором args — иначе панель врёт. */
const flexArgsOff = Object.fromEntries(["handSide", "handSize", "reactionsWidth", "gap", "profileJustify", "dockInset", "safeBottom", "safeTop", "safeSide"]
  .map((k) => [k, { table: { disable: true } }]));

/**
 * ПЛОЩАДКА РЕГИОНОВ: восемь областей по краям (три региона верха, рука+реакции внизу, колонки по
 * бокам). Углы — по владельцам (панель «Углы»): переключи bottom-left на left — колонка дотянется
 * до низа, а рука подвинется; bleed вернёт её на полный лейн (явный наплыв). Наплывов по умолчанию
 * НЕТ — это формула лейна, не дисциплина.
 */
export const RegionsPlayground: StoryObj<RegionArgs> = {
  parameters: {
    code: () => `// Три региона делят ЛЕЙН края: px-константы держатся, {fr}/auto делят свободное
// ВСЕГО лейна, center клампится между соседями.
hud: {
  areas: [
    region("top", "start",  [placeholderW("меню", 120)]),
    region("top", "center", [placeholderW("статус", 160)]),   // центрирование = выбор региона
    region("top", "end",    [placeholderW("профиль", 120)]),
    region("bottom", "start", [zoneW("hand", "auto")], { gap: 10, inset: 12 }),
    region("left", "start", [placeholderW("туллбар", 150)]),  // вертикальные области — те же данные
  ],
  // УГЛЫ: спорный угол принадлежит РОВНО одному краю (дефолт — горизонтали): наплыв соседних
  // областей НЕВОЗМОЖЕН по формуле. Пустой угол отдаёт место сам. bleed: true — явная дверь.
  corners: { "bottom-left": "left" }, // отдать угол левой колонке — низ уступит
}`,
  },
  args: { handSlot: "start", handWidth: 300, cornerBottomLeft: "bottom", cornerBottomRight: "bottom", handBleed: false, gap: 10, inset: 0 },
  argTypes: {
    handSlot: { table: { category: "Область руки" }, description: "регион низа: прижим — выбором региона (start/center/end)", control: { type: "inline-radio" }, options: ["start", "center", "end"] },
    handWidth: { table: { category: "Область руки" }, description: "px-длина области руки (константа держится, лейн пустеет)", control: { type: "range", min: 180, max: 520, step: 20 } },
    handBleed: { table: { category: "Область руки" }, description: "ЯВНЫЙ наплыв: рука ложится по НЕурезанному лейну (игнорирует угловые вычеты)", control: { type: "boolean" } },
    gap: { table: { category: "Область руки" }, description: "зазор виджетов области", control: { type: "range", min: 0, max: 40, step: 2 } },
    inset: { table: { category: "Область руки" }, description: "дальность области от края (поверх safe-zone)", control: { type: "range", min: 0, max: 64, step: 4 } },
    cornerBottomLeft: { table: { category: "Углы (corners)" }, description: "владелец нижне-левого угла: bottom — низ во всю ширину; left — колонка до низа, рука уступает", control: { type: "inline-radio" }, options: ["bottom", "left"] },
    cornerBottomRight: { table: { category: "Углы (corners)" }, description: "владелец нижне-правого угла", control: { type: "inline-radio" }, options: ["bottom", "right"] },
    ...flexArgsOff,
  } as never,
  render: (a) => <RegionsStage {...(a as unknown as RegionArgs)} />,
};

/**
 * ДВЕ ЛЕНТЫ у одного игрока: рука с картами и мешок фишек (другой контент, та же механика).
 * Контролы ставят стартовые пины; кнопки сверху перекидывают зоны борд↔HUD ЖИВЬЁМ (applySpec):
 * жители перелетают, сцена не пересоздаётся.
 */
export const TwoHands: StoryObj<TwoArgs> = {
  args: { handPin: "hud", pouchPin: "hud-bottom" },
  argTypes: {
    handPin: { description: "где стартует рука", control: { type: "inline-radio" }, options: ["hud", "board"] },
    pouchPin: { description: "где стартует мешок: край, пин-якорь (bottom-right, поверх стола) или борд", control: { type: "inline-radio" }, options: ["hud-bottom", "hud-right", "pin", "board"] },
    ...flexArgsOff,
  } as never,
  render: (a) => <TwoStage {...(a as unknown as TwoArgs)} />,
};

/**
 * LIVE: два экрана над ОДНИМ портом, у каждого ДВЕ ленты. Контролы крутят СВОЙСТВА ТВОЕЙ руки —
 * на соседнем экране видно, как она выглядит у него: pin hud → мини-визави (зеркало, atSeat),
 * pin board → полоса ужатой; hidden — рубашки/лица; access — open/request («по запросу»)/locked.
 * Мешок всегда открыт: дроп в мешок соседа работает. Снимок один на всех.
 */
export const LiveTwoHands: StoryObj<LiveTwoArgs> = {
  args: { handPin: "hud", handHidden: true, handAccess: "request", handAtSeat: "below", pouchPin: "board" },
  argTypes: {
    handPin: { description: "где ТВОЯ рука: hud — док у низа (соседу мини-визави); board — полоса на борде (соседу ужатая полоса)", control: { type: "inline-radio" }, options: ["hud", "board"] },
    handHidden: { description: "приватность значений: сосед видит рубашки (true) или лица (false)", control: { type: "boolean" } },
    handAccess: { description: "доступ соседа: open — дроп/взятие включены; request — по запросу (пометка); locked — заперто", control: { type: "inline-radio" }, options: ["open", "request", "locked"] },
    handAtSeat: { description: "где мини-рука живёт у твоего аватара на чужом экране (pin hud)", control: { type: "inline-radio" }, options: ["above", "below", "left", "right"] },
    pouchPin: { description: "где мешок фишек", control: { type: "inline-radio" }, options: ["hud", "board"] },
    ...flexArgsOff,
  } as never,
  render: (a) => <LiveTwoStage {...(a as unknown as LiveTwoArgs)} />,
};

/**
 * КОЛОДА В HUD: pile-зона стопкой у правого края — рубашками (правило зоны, не дока). Верхняя
 * карта тащится на борд, карта с борда/руки ложится в стопку СВЕРХУ; кнопки перекидывают колоду
 * борд↔HUD живьём (applySpec). Инструмент «ГОЛОС» — generic widget в пине.
 */
export const DeckDock: StoryObj<DeckArgs> = {
  parameters: {
    code: () => `// Докуется зона ЛЮБОГО вида с презентацией дока (strip/presentation):
//   strip → ряд со вставкой и гэп-превью; pile → СТОПКА (взять верхнюю, дроп сверху).
// Прочие виды пока живут на борде — zoneDockConfig честно отдаёт null.
hud: { areas: [
  region("bottom", "start", [zoneW("hand", "auto")]),
  region("right", "start", [zoneW("deck")]),  // pile-колода колонкой-стопкой у правого края
  pin("bottom-right", [zoneW("tools", 90)], { offset: { x: -8, y: -170 } }), // widget-инструмент
] }
// Лицо в доке — ПРАВИЛО зоны (faceUpInSlot): рука лицом, колода рубашками.
// Переезд живой: scene.applySpec(specСДругимHud) — ноды те же, полёт непрерывный.`,
  },
  args: { deckPin: "hud" },
  argTypes: {
    deckPin: { description: "где колода: стопкой в области HUD или на борде", control: { type: "inline-radio" }, options: ["hud", "board"] },
    ...flexArgsOff,
  } as never,
  render: (a) => <DeckStage {...(a as unknown as DeckArgs)} />,
};
