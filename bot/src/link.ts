// БОТ КАК ДВЕРЬ В АККАУНТ: человек открыл ссылку с кодом, телега сказала боту, кто он, бот говорит
// это серверу.
//
// Бот НЕ ЗНАЕТ ни имени аккаунта, ни кода восстановления — он утверждает ровно одно: «вот этот
// код принёс мне вот этот chat_id». Всё остальное решает сервер (`telegramLink.ts`), и правило
// слияния тоже: чистого гостя переключают, две полноценные стороны не сливают никогда.

/** Чем кончилась попытка — теми же словами, что и у сервера. */
export type ClaimKind = "linked" | "switch" | "conflict";

export interface ClaimResult {
  readonly kind: ClaimKind;
  /** Как зовут того, кем человек оказался. */
  readonly name?: string;
  /** О чём спросить его прямо здесь: взять ли тамошнее имя, взять ли лицо. */
  readonly offer?: { kind: "none" | "name" | "photo"; name?: string; photo?: string };
}

/**
 * ПОЧЕМУ НЕ ВЫШЛО — и это разные вещи, которые нельзя говорить одной фразой.
 *
 * `stale` — ссылка и правда устарела (или её выдал другой процесс сервера). `already` — этот же код
 * уже сработал: человек нажал ту же кнопку второй раз, и «начни заново» здесь читается как поломка.
 * `misconfigured` — сервер не признал бота: это НАСТРОЙКА, и человек не должен принимать её за
 * сломанную ссылку, потому что жать заново бесполезно.
 */
export type ClaimFailure = "stale" | "already" | "misconfigured" | "offline" | "unknown-source";

export interface ClaimParts {
  readonly serverUrl: string;
  readonly secret: string;
  fetch?: typeof globalThis.fetch;
}

/**
 * Сказать серверу, чей это код — и как этого человека зовут в телеге.
 *
 * ИМЯ ЕДЕТ ПОДПИСЬЮ, А НЕ КЛЮЧОМ: по `@erbol` человек в профиле УЗНАЁТ свою дверь, а «привязан»
 * ему приходится принимать на веру. Ключом остаётся `chat_id`, и он наружу не отдаётся.
 */
/** Что бот знает про человека на той стороне — всё, кроме байтов его лица. */
export interface ClaimFace {
  readonly label?: string;
  readonly name?: string;
  /** Ключ к лицу. Байты по нему заберёт сервер: в ссылке на файл живёт токен бота. */
  readonly photoFileId?: string;
}

export async function claimLink(
  parts: ClaimParts,
  code: string,
  telegramId: string,
  face: ClaimFace = {},
): Promise<ClaimResult | ClaimFailure> {
  const call = parts.fetch ?? globalThis.fetch;
  try {
    const res = await call(`${parts.serverUrl}/auth/telegram/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        telegramId,
        secret: parts.secret,
        ...(face.label ? { telegramName: face.label } : {}),
        ...(face.name ? { offeredName: face.name } : {}),
        ...(face.photoFileId ? { offeredPhotoFileId: face.photoFileId } : {}),
      }),
    });
    if (res.status === 401 || res.status === 503) return "misconfigured";
    if (res.status === 409) return "already";
    if (!res.ok) return "stale";
    return (await res.json()) as ClaimResult;
  } catch {
    return "offline";
  }
}

export interface ProfileSaid {
  readonly name: string;
  readonly offer: { kind: "none" | "name" | "photo"; name?: string; photo?: string };
}

/**
 * СКАЗАТЬ СЕРВЕРУ, ЧТО ЧЕЛОВЕК ВЫБРАЛ В РАЗГОВОРЕ. Кода восстановления у бота нет: он доказывает
 * общим секретом, что он наш, а дверь говорит, чей это аккаунт.
 */
export async function tellProfile(
  parts: ClaimParts,
  telegramId: string,
  what: { name?: string; photoFileId?: string; keep?: "name" | "photo" },
): Promise<ProfileSaid | undefined> {
  const call = parts.fetch ?? globalThis.fetch;
  try {
    const res = await call(`${parts.serverUrl}/auth/telegram/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, secret: parts.secret, ...what }),
    });
    if (!res.ok) return undefined;
    return (await res.json()) as ProfileSaid;
  } catch {
    return undefined;
  }
}

/** Что человек читает в ответ. Односложно: он уже смотрит не сюда, а на свою страницу. */
export function claimReply(result: ClaimResult | ClaimFailure): string {
  if (typeof result === "string") {
    switch (result) {
      case "already":
        return "Этот Telegram уже привязан по этой ссылке. Возвращайся на страницу.";
      case "misconfigured":
        // ЖАТЬ ЗАНОВО БЕСПОЛЕЗНО, и говорить «устарела» здесь — врать: сервер не признал бота.
        return "Сервер меня не узнал: у бота и сервера разный секрет привязки. Ссылка тут ни при чём.";
      case "unknown-source":
        // Ссылка живая, но приложения, которое её выдало, бот не знает — это тоже настройка.
        return "Эта ссылка из приложения, о котором я не знаю. Проверь настройки бота.";
      case "offline":
        return "Сервер не отвечает. Попробуй через минуту.";
      case "stale":
        return "Ссылка устарела. Открой профиль на странице и нажми «Привязать» ещё раз.";
    }
  }
  switch (result.kind) {
    case "linked":
      // ЧТО ДАЛЬШЕ, СПРАШИВАЕТ РАЗГОВОР, А НЕ ЭТА ФРАЗА (`talk.ts`): человек стоит здесь, и два
      // вопроса про имя и лицо задаются ему кнопками, не отсылая его на страницу.
      return "Готово — Telegram привязан.";
    case "switch":
      return `С возвращением${result.name ? `, ${result.name}` : ""}. На странице ты снова это ты.`;
    case "conflict":
      // СЛИЯНИЕ НЕОБРАТИМО, поэтому здесь его не предлагают даже кнопкой: человек решает сам, каким
      // аккаунтом он хочет быть.
      return "Этот Telegram уже привязан к другому аккаунту. Войди им — или отвяжи телеграм там.";
  }
}
