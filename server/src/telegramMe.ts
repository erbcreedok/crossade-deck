// КАК ЗОВУТ НАШЕГО БОТА — спрошено у телеги, а не вписано руками.
//
// Ссылка привязки собирается из этого имени, и ошибиться в нём значит отправить человека в ЧУЖОГО
// бота: ссылка выглядит настоящей, открывается, и там незнакомый бот, который про этот код ничего
// не знает. Имя, вписанное руками в переменную, расходится с настоящим ровно один раз — и этого
// хватает.
//
// Токен у сервера уже есть: им проверяется подпись Mini App (`telegramAuth.ts`). `getMe` — первый
// исходящий вызов Bot API в этом продукте, и он ровно один: ответ запоминается на процесс.

/** Имя из окружения перебивает всё: на машине без сети иначе не поработать. */
const OVERRIDE = (): string | undefined => process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || undefined;

let asked: Promise<string | undefined> | undefined;

async function askTelegram(token: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (!res.ok) return undefined;
    const body = (await res.json()) as { ok?: boolean; result?: { username?: string } };
    return body.ok && typeof body.result?.username === "string" ? body.result.username : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Имя бота, если его вообще можно узнать. `undefined` — ни имени в окружении, ни токена, ни ответа
 * от телеги: значит привязку через бота предлагать нечем, и маршрут отвечает 503.
 *
 * НЕУДАЧА НЕ ЗАПОМИНАЕТСЯ: сервер, поднявшийся раньше сети, иначе остался бы без имени до
 * перезапуска.
 */
export function botUsername(): Promise<string | undefined> {
  const override = OVERRIDE();
  if (override) return Promise.resolve(override);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return Promise.resolve(undefined);
  if (!asked) {
    asked = askTelegram(token).then((name) => {
      if (!name) asked = undefined;
      return name;
    });
  }
  return asked;
}

/** Только для тестов: забыть, что мы уже спрашивали. */
export function forgetBotUsername(): void {
  asked = undefined;
}
