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
    argType: { name: "подпись", control: { type: "text" } },
    // Живьём: setLabel перерисовывает текст и пересчитывает ширину — ровно то, что делает игра,
    // когда подпись зоны меняется под грузом («сбросить» → «взять себе»).
    apply: (b, v) => b.setLabel(String(v ?? "")),
    hint: "текст на кнопке; ширина кнопки считается по нему (см. Button.w)",
  },
  variant: {
    argType: { name: "вид", control: { type: "select" }, options: VARIANTS },
    apply: "rebuild", // палитра и обводка выбираются в конструкторе
    hint: "primary — основное действие; secondary — обычное; danger — разрушительное; ghost — только контур; text — голый текст без фона",
  },
  size: {
    argType: { name: "размер", control: { type: "select" }, options: SIZES },
    apply: "rebuild", // габарит и кегль зашиты при создании
    hint: "sm 92×36 / md 124×46 / lg 168×58 — фиксированные габариты, не «от контента»",
  },
  disabled: {
    argType: { name: "недоступна", control: { type: "boolean" } },
    apply: (b, v) => b.setDisabled(Boolean(v)),
    hint: "гасит кнопку и глушит клик; ховер и нажатие при этом не срабатывают",
  },
  onClick: {
    argType: false, // коллбек: контролом не выразить, а стори подставляет свой
    apply: "rebuild",
    hint: "обработчик клика; сам Button событий не слушает — ввод в него роутит движок сцены",
  },
} satisfies Record<keyof ButtonOptions, ButtonArgSpec>;

export type ButtonArgKey = keyof typeof BUTTON_ARGS;

/** Подмножество опций кнопки для конкретной стори. */
export function pickButtonArgs<K extends ButtonArgKey>(
  keys: readonly K[],
): { argTypes: Record<string, ArgTypeEntry>; apply: ApplyPlan<Button, Pick<ButtonArgs, K>> } {
  return pickSpecs<Button, ButtonArgs, K>(BUTTON_ARGS, keys);
}
