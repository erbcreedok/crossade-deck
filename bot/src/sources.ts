// ОДИН БОТ, НЕСКОЛЬКО ПРИЛОЖЕНИЙ — и `/start` единственное место, где он узнаёт, кому адресовано
// сообщение.
//
// В токене этого нет и быть не может: токен говорит, КТО БОТ, а не чьё приложение прислало человека.
// Поэтому приложение подписывает свою ссылку собственным именем — `t.me/<бот>?start=<source>_<код>`,
// — а бот по этому имени выбирает, какому серверу нести подтверждение и каким секретом.
//
// У каждого приложения СВОЙ секрет. Общий на всех означал бы, что чужой сервис, узнав его, может
// подтверждать привязки в чужом приложении.

export interface Source {
  /** Имя, которым приложение подписывает свои ссылки. */
  readonly name: string;
  readonly serverUrl: string;
  readonly secret: string;
}

/** Что приехало в `/start`: чьё это приложение и какой код. */
export interface StartPayload {
  /** Пусто — ссылка без имени: так выглядят ссылки приложения, которое о втором ещё не знает. */
  readonly source?: string;
  readonly code: string;
}

/** Имя приложения — только буквы и цифры, чтобы разделитель оставался разделителем. */
const NAME = /^[a-z0-9]{1,16}$/;
/** Код — hex, и это то, что позволяет резать payload по первому `_` без догадок. */
const CODE = /^[a-f0-9]{16,64}$/i;

/**
 * РАЗОБРАТЬ PAYLOAD. Пусто, лишние слова, чужой формат — это обычный `/start`, а не привязка, и
 * обращаться с ним надо как с обычным.
 */
export function readStart(payload: string | undefined): StartPayload | undefined {
  const raw = payload?.trim();
  if (!raw) return undefined;
  const cut = raw.indexOf("_");
  if (cut < 0) return CODE.test(raw) ? { code: raw } : undefined;
  const source = raw.slice(0, cut).toLowerCase();
  const code = raw.slice(cut + 1);
  if (!NAME.test(source) || !CODE.test(code)) return undefined;
  return { source, code };
}

/**
 * РЕЕСТР ПРИЛОЖЕНИЙ ИЗ ОКРУЖЕНИЯ: `SOURCE_<ИМЯ>_URL` и `SOURCE_<ИМЯ>_SECRET` — по паре на каждое.
 *
 * Приложение без секрета в реестр НЕ ПОПАДАЕТ: подтверждать привязку нечем, и молча ходить к нему с
 * чужим секретом значит получать 401 и говорить человеку «ссылка устарела».
 */
export function sourcesOf(env: NodeJS.ProcessEnv = process.env): Map<string, Source> {
  const found = new Map<string, Source>();
  for (const key of Object.keys(env)) {
    const named = /^SOURCE_([A-Z0-9]+)_URL$/.exec(key);
    if (!named) continue;
    const name = named[1]!.toLowerCase();
    const serverUrl = env[key]?.trim();
    const secret = env[`SOURCE_${named[1]}_SECRET`]?.trim();
    if (!serverUrl || !secret) continue;
    found.set(name, { name, serverUrl, secret });
  }
  return found;
}

/**
 * КУДА НЕСТИ ЭТО ПОДТВЕРЖДЕНИЕ. Ссылка без имени — приложению по умолчанию (`SERVER_URL` и
 * `TELEGRAM_LINK_SECRET`), как было до появления второго; с именем — только тому, кто в реестре.
 *
 * НЕЗНАКОМОЕ ИМЯ НЕ ПАДАЕТ НА УМОЛЧАНИЕ: подтверждение ушло бы чужому серверу, тот ответил бы «не
 * знаю такого кода», и человек читал бы «ссылка устарела» про совершенно рабочую ссылку.
 */
export function sourceFor(
  payload: StartPayload,
  registry: Map<string, Source>,
  fallback: { serverUrl: string; secret?: string } | undefined,
): Source | undefined {
  if (payload.source) return registry.get(payload.source);
  if (!fallback?.secret) return undefined;
  return { name: "default", serverUrl: fallback.serverUrl, secret: fallback.secret };
}
