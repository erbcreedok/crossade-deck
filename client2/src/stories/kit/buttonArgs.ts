import type { Button, ButtonOptions, ButtonSize, ButtonVariant } from "../../game/ui/Button";
import type { ArgTypeEntry } from "../harness/paramArgs";
import type { ApplyPlan } from "../harness/argApply";
import { pickSpecs, type ArgSpec } from "../harness/argSpec";

// Полная карта опций кнопки — второй экземпляр приёма, заведённого для карты (cardArgs.ts).
// `satisfies Record<keyof ButtonOptions, …>` внизу ломает tsc, если у Button появилась опция,
// не описанная тут, или описана исчезнувшая: каталог не может молча разойтись с компонентом.

export type ButtonArgs = {
  [K in keyof ButtonOptions]-?: ButtonOptions[K];
};

export type ButtonArgSpec = ArgSpec<Button, ButtonArgs>;

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "danger", "ghost", "text"];
const SIZES: ButtonSize[] = ["sm", "md", "lg"];

export const BUTTON_ARGS = {
  label: {
    argType: { control: { type: "text" } },
    label: "подпись",
    // Живьём: setLabel перерисовывает текст и пересчитывает ширину — ровно то, что делает игра,
    // когда подпись зоны меняется под грузом («сбросить» → «взять себе»).
    apply: (b, v) => b.setLabel(String(v ?? "")),
    hint: "текст на кнопке; ширина кнопки считается по нему (см. Button.w)",
  },
  variant: {
    argType: { control: { type: "select" }, options: VARIANTS },
    label: "вид",
    apply: "rebuild", // палитра и обводка выбираются в конструкторе
    hint: "primary — основное действие; secondary — обычное; danger — разрушительное; ghost — только контур; text — голый текст без фона",
  },
  size: {
    argType: { control: { type: "select" }, options: SIZES },
    label: "размер",
    apply: "rebuild", // габарит и кегль зашиты при создании
    hint: "sm 92×36 / md 124×46 / lg 168×58 — фиксированные габариты, не «от контента»",
  },
  disabled: {
    argType: { control: { type: "boolean" } },
    label: "недоступна",
    apply: (b, v) => b.setDisabled(Boolean(v)),
    hint: "гасит кнопку и глушит клик; ховер и нажатие при этом не срабатывают",
  },
  onClick: {
    argType: false, // коллбек: контролом не выразить, а стори подставляет свой
    label: "обработчик клика",
    apply: "rebuild",
    hint: "обработчик клика; сам Button событий не слушает — ввод в него роутит движок сцены",
  },

  // ——— оформление поверх варианта ———
  color: {
    argType: { control: { type: "color" } },
    label: "заливка",
    apply: "rebuild", // цвет уходит в отрисовку фона при сборке
    hint: "своя заливка вместо цвета варианта. Пусто — цвет варианта. Ховер и нажатие подкрашивают ЕЁ, а не исходный",
  },
  borderColor: {
    argType: { control: { type: "color" } },
    label: "цвет обводки",
    apply: "rebuild",
    hint: "своя обводка вместо цвета варианта",
  },
  textColor: {
    argType: { control: { type: "color" } },
    label: "цвет подписи",
    apply: "rebuild",
    hint: "свой цвет текста вместо цвета варианта. У text-кнопки перебивает всю шкалу состояний — иначе цвет виден только в покое и пропадает под курсором",
  },
  borderWidth: {
    argType: { control: { type: "range", min: 0, max: 8, step: 0.5 } },
    label: "толщина обводки",
    apply: "rebuild",
    hint: "0 — без обводки; не задана — 2 (у «включённой» кнопки 3)",
  },
  fillAlpha: {
    argType: { control: { type: "range", min: 0, max: 1, step: 0.05 } },
    label: "прозрачность заливки",
    apply: "rebuild",
    hint: "0 — фона нет совсем (как у ghost), 1 — плотный. Отдельно от прозрачности текста и рамки: полупрозрачная плашка с чётким текстом — обычный приём, а «выцветшая целиком» кнопка значит «недоступна»",
  },
  borderAlpha: {
    argType: { control: { type: "range", min: 0, max: 1, step: 0.05 } },
    label: "прозрачность обводки",
    apply: "rebuild",
    hint: "0 — рамки не видно; то же даёт borderWidth: 0",
  },
  textAlpha: {
    argType: { control: { type: "range", min: 0, max: 1, step: 0.05 } },
    label: "прозрачность подписи",
    apply: "rebuild",
    hint: "0 — подписи не видно",
  },
  elevation: {
    argType: { control: { type: "range", min: 0, max: 24, step: 1 } },
    label: "высота над поверхностью",
    apply: "rebuild",
    hint: "0 — лежит, тени нет. Тень СВОЯ, а не общий теневой пасс стола: кнопка — интерфейс поверх стола, и в общей маске она затемняла бы карты под собой. При нажатии высота падает — кнопка вдавливается, тень подбирается",
  },
  radius: {
    argType: { control: { type: "range", min: 0, max: 40, step: 1 } },
    label: "скругление",
    apply: "rebuild",
    hint: "радиус углов; 0 — от размера кнопки (sm 8 / md 10 / lg 12)",
  },

  // ——— габарит ———
  fit: {
    argType: { control: { type: "select" }, options: ["preset", "content"] },
    label: "как выбирается габарит",
    apply: "rebuild",
    hint: "preset — фиксированный размер sm/md/lg (ряд кнопок стоит ровно); content — по содержимому: длинная подпись растягивает кнопку",
  },
  textSize: {
    argType: { control: { type: "range", min: 0, max: 48, step: 1 } },
    label: "кегль подписи",
    apply: "rebuild",
    hint: "базовый кегль; 0 — от размера кнопки (sm/md/lg). Дальше его правят textShrink/textGrow",
  },
  textShrink: {
    argType: { control: { type: "boolean" } },
    label: "ужимать текст",
    apply: "rebuild",
    hint: "уменьшать подпись, если она не влезает. По умолчанию ВКЛЮЧЕНО: вылезший за кнопку текст — поломка, а не решение. Многоточия нет намеренно: обрезанное слово хуже мелкого",
  },
  textGrow: {
    argType: { control: { type: "boolean" } },
    label: "растягивать текст",
    apply: "rebuild",
    hint: "увеличивать подпись, если в кнопке есть запас. По умолчанию выключено: самовольно выросшая подпись ломает ряд одинаковых кнопок",
  },
  textFit: {
    argType: { control: { type: "select" }, options: ["both", "horizontal", "vertical"] },
    label: "ось подгонки",
    apply: "rebuild",
    hint: "по какой оси считать «влезает»: horizontal — только ширина, vertical — только высота, both — обе (берётся меньший коэффициент). shrink + grow + both = полный адаптив",
  },
  width: {
    argType: { control: { type: "range", min: 0, max: 400, step: 4 } },
    label: "ширина",
    apply: "rebuild",
    hint: "точная ширина; 0 — не задана. Перебивает и пресет, и content-fit, но НЕ границы min/max",
  },
  height: {
    argType: { control: { type: "range", min: 0, max: 200, step: 2 } },
    label: "высота",
    apply: "rebuild",
    hint: "точная высота; 0 — не задана",
  },
  minWidth: { argType: { control: { type: "range", min: 0, max: 400, step: 4 } }, label: "мин. ширина", apply: "rebuild", hint: "нижняя граница; действует и на явную ширину" },
  maxWidth: { argType: { control: { type: "range", min: 0, max: 400, step: 4 } }, label: "макс. ширина", apply: "rebuild", hint: "верхняя граница; 0 — без предела. Вместе с textSize:adaptive это и есть «влезть в отведённое место»" },
  minHeight: { argType: { control: { type: "range", min: 0, max: 200, step: 2 } }, label: "мин. высота", apply: "rebuild", hint: "нижняя граница" },
  maxHeight: { argType: { control: { type: "range", min: 0, max: 200, step: 2 } }, label: "макс. высота", apply: "rebuild", hint: "верхняя граница; 0 — без предела" },
  padding: {
    argType: { control: { type: "range", min: 0, max: 40, step: 1 } },
    label: "поле вокруг текста",
    apply: "rebuild",
    hint: "участвует и в content-fit (ширина = текст + два поля), и в ужатии подписи",
  },
} satisfies Record<keyof ButtonOptions, ButtonArgSpec>;

export type ButtonArgKey = keyof typeof BUTTON_ARGS;

/** Подмножество опций кнопки для конкретной стори. */
export function pickButtonArgs<K extends ButtonArgKey>(
  keys: readonly K[],
): { argTypes: Record<string, ArgTypeEntry>; apply: ApplyPlan<Button, Pick<ButtonArgs, K>> } {
  return pickSpecs<Button, ButtonArgs, K>(BUTTON_ARGS, keys);
}
