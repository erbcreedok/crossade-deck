// ЧТО ПЕЧАТАЕТ «SHOW CODE».
//
// Живёт в `src`, а не в `.storybook`, по той же причине, что и арифметика таблицы рычагов: это
// чистая функция, и проверять её надо юнитом.

export interface SourceCtx {
  args?: Record<string, unknown>;
  initialArgs?: Record<string, unknown>;
  parameters?: { code?: (args: Record<string, unknown>) => string };
}

/**
 * Смотрящий уже поднял движок; ему нужен код, который ВОСПРОИЗВЕДЁТ ЭТУ КАРТИНКУ. Ни исходник
 * стори, ни его пересказ на этот вопрос не отвечают: стори — это React, контролы и общий пул
 * канвасов, то есть устройство КАТАЛОГА, а не применение компонента. Раньше тут печаталось
 * `{ args: { … } }` — фрагмент, который никуда не скопируешь.
 *
 * Поэтому раздел один раз описывает, как из аргументов собирается код компонента
 * (`parameters.code`), а мы зовём это с аргументами КОНКРЕТНОЙ стори. Разъехаться с компонентом
 * такой код не может: аргументы те же, что крутятся в панели.
 */
export function sourceFor(code: string, ctx: SourceCtx): string {
  const args = ctx.args ?? ctx.initialArgs ?? {};
  const make = ctx.parameters?.code;
  if (make) return make(args);
  // Раздел свой шаблон не описал — печатаем хотя бы аргументы, но честно говорим, что это не
  // код компонента. Молча показывать `{}` хуже: блок выглядит сломанным.
  const body = Object.entries(args)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`)
    .join("\n");
  const own = code.trim();
  if (!body) return own && own !== "{}" ? code : "// У раздела не описан parameters.code — показывать нечего.";
  return `// Аргументы этой стори. Кода компонента у раздела не описано (parameters.code).\n{\n${body}\n}`;
}
