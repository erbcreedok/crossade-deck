// ТАБЛИЦА РЫЧАГОВ — что в ней стоит в колонках Default и «тип».
//
// Живёт в `src`, а не в `.storybook`, ровно по одной причине: это ЧИСТАЯ арифметика над объектом
// argTypes, и её надо проверять юнитом. Конфиг сторибука подключает эти функции как
// `argTypesEnhancers` и своей логики не содержит.

export interface ArgTypeRow {
  options?: unknown[];
  type?: unknown;
  table?: { defaultValue?: unknown; type?: unknown };
}

/**
 * Заполнить колонку **Default**.
 *
 * Она была пустой ВЕЗДЕ (`-`), и это не косметика: без дефолта таблица не отвечает на «а как оно
 * себя ведёт из коробки». Storybook берёт её из `argTypes[k].table.defaultValue`, а мы её нигде не
 * задавали — ни руками, ни в мосте `Param → argTypes`. Проставляем из начальных аргументов стори:
 * другого источника правды о дефолте нет, и дублировать его руками значило бы завести второй,
 * который разойдётся.
 */
export function fillDefaults(ctx: { argTypes?: Record<string, ArgTypeRow>; initialArgs?: Record<string, unknown> }): Record<string, ArgTypeRow> {
  const at = ctx.argTypes ?? {};
  const args = ctx.initialArgs ?? {};
  for (const [k, v] of Object.entries(at)) {
    if (!v || v.table?.defaultValue !== undefined || !(k in args)) continue;
    const d = args[k];
    Object.assign(v, { table: { ...(v.table ?? {}), defaultValue: { summary: typeof d === "string" ? d : JSON.stringify(d) } } });
  }
  return at;
}

/**
 * Что писать в колонке типа — под русским описанием рычага.
 *
 * Storybook выводит тип из ЗНАЧЕНИЯ начального аргумента, и плашка выходит либо ложной, либо
 * пустой по смыслу: у списка из четырёх вариантов стояло `string`, у тумблера — `boolean`, у
 * слайдера — `number`. Первое неверно, второе и третье уже видно по самому контролу.
 *
 * Поэтому тип остаётся только там, где он ЧТО-ТО СООБЩАЕТ, — у списка выбора, и пишется настоящим
 * союзом. У остальных ставится `null`: таблица печатает `table.type || type`, и оба ложных значения
 * означают «плашки нет». Именно `null`, а не `delete`: штатный вывод типов идёт своим проходом и
 * подставляет тип там, где ключа НЕТ, — удалённое он возвращал обратно.
 */
export function fillTypes(ctx: { argTypes?: Record<string, ArgTypeRow> }): Record<string, ArgTypeRow> {
  const at = ctx.argTypes ?? {};
  for (const v of Object.values(at)) {
    if (!v) continue;
    if (v.options?.length) {
      Object.assign(v, { table: { ...(v.table ?? {}), type: { summary: v.options.map((o) => JSON.stringify(o)).join(" | ") } } });
      continue;
    }
    Object.assign(v, { type: null, table: { ...(v.table ?? {}), type: null } });
  }
  return at;
}
// Вторым проходом: штатный вывод типов (`inferArgTypes`/`inferControls`) сам зарегистрирован
// вторым, и снятое в первом он ставит обратно.
fillTypes.secondPass = true;
