import type { ArgTypeEntry } from "./paramArgs";
import type { Applier, ApplyPlan } from "./argApply";

// Общая форма «карты опций компонента» и выборки из неё. Первым такую карту завёл Card
// (kit/cardArgs.ts); со второй (Button) стало ясно, что в ней про карту ничего нет — это просто
// «опция → контрол + как применить + что она значит». Механику вынесли сюда, чтобы каждая новая
// карта опций не тащила свою копию pickArgs: копий должно быть ноль, а не по одной на компонент.
//
// Эксгаустивность (`satisfies Record<keyof XOptions, ArgSpec<…>>`) остаётся на стороне КАЖДОЙ
// карты — именно она ломает tsc, когда у компонента появилась опция, не описанная в каталоге.
// Обобщать её нечего и незачем: она про конкретный тип опций.

export interface ArgSpec<T, A> {
  /** Контрол в панели. `false` — опция сознательно НЕ крутится (ключ адресации, коллбек и т.п.). */
  argType: ArgTypeEntry | false;
  /** Как применить правку: живой сеттер или «пересобрать сцену» (см. argApply.ts). */
  apply: Applier<T, A> | "rebuild";
  /** Одной строкой: что опция делает. Уходит в подпись контрола — это и есть шпаргалка. */
  hint: string;
}

/**
 * Подмножество опций для конкретной стори: argTypes для панели + план применения.
 *
 * План типизирован РОВНО выбранным подмножеством, а не всей картой: иначе стори, берущая пять
 * опций, обязана была бы объявлять все. Приведение внутри — следствие того, что Applier
 * параметризован значением `A[keyof A]` и сузить его снаружи нельзя; снаружи тип остаётся точным,
 * а это единственное, что видит автор стори.
 */
export function pickSpecs<T, A extends object, K extends string>(
  specs: Record<K, ArgSpec<T, A>>,
  keys: readonly K[],
): { argTypes: Record<string, ArgTypeEntry>; apply: ApplyPlan<T, Pick<A, K & keyof A>> } {
  const argTypes: Record<string, ArgTypeEntry> = {};
  const apply: Record<string, ArgSpec<T, A>["apply"]> = {};
  for (const k of keys) {
    const spec = specs[k];
    // Подпись контрола = человеческое имя + пояснение. Панель тем самым отвечает на вопрос «что
    // это вообще делает», не отсылая читать исходник компонента.
    if (spec.argType) argTypes[k] = { ...spec.argType, name: `${spec.argType.name} — ${spec.hint}` };
    apply[k] = spec.apply;
  }
  return { argTypes, apply: apply as ApplyPlan<T, Pick<A, K & keyof A>> };
}
