// ГДЕ ЭКРАН БЕРЁТ СТРОКУ, КОТОРУЮ ВВЁЛ ЧЕЛОВЕК.
//
// Экран профиля НЕ РАСТИТ СЕБЕ КЛАВИАТУРУ: он просит строку у внешнего слоя и получает её готовой.
// В браузере это окно ввода; в Mini App за это же берётся телега. Своё поле с автодополнением,
// эмодзи и выделением — отдельный проект, и он не нужен ради двух строк в профиле.
//
// Одной функцией, чтобы подменить её можно было целиком — в тесте и в Mini App одинаково.

export type Ask = (question: string, value: string) => Promise<string | undefined>;

/** Спросить у браузера. `undefined` — человек отказался; пустая строка — это ответ, а не отказ. */
export const askInWindow: Ask = async (question, value) => {
  const got = globalThis.prompt?.(question, value);
  return got === null || got === undefined ? undefined : got.trim();
};
