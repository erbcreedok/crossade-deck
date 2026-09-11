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
}

/**
 * ПОЧЕМУ НЕ ВЫШЛО — и это разные вещи, которые нельзя говорить одной фразой.
 *
 * `stale` — ссылка и правда устарела (или её выдал другой процесс сервера). `already` — этот же код
 * уже сработал: человек нажал ту же кнопку второй раз, и «начни заново» здесь читается как поломка.
 * `misconfigured` — сервер не признал бота: это НАСТРОЙКА, и человек не должен принимать её за
 * сломанную ссылку, потому что жать заново бесполезно.
 */
export type ClaimFailure = "stale" | "already" | "misconfigured" | "offline";

/**
 * КОД ИЗ `/start` — тот, что телега передала как payload. Пусто, лишние слова, чужой формат — это
 * обычный `/start`, а не привязка, и обращаться с ним надо как с обычным.
 */
export function codeOfStart(payload: string | undefined): string | undefined {
  const code = payload?.trim();
  if (!code) return undefined;
  // Код собран из base64url — всё, что в него не укладывается, кодом не является.
  return /^[A-Za-z0-9_-]{8,64}$/.test(code) ? code : undefined;
}

export interface ClaimParts {
  readonly serverUrl: string;
  readonly secret: string;
  fetch?: typeof globalThis.fetch;
}

/** Сказать серверу, чей это код. */
export async function claimLink(
  parts: ClaimParts,
  code: string,
  telegramId: string,
): Promise<ClaimResult | ClaimFailure> {
  const call = parts.fetch ?? globalThis.fetch;
  try {
    const res = await call(`${parts.serverUrl}/auth/telegram/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, telegramId, secret: parts.secret }),
    });
    if (res.status === 401 || res.status === 503) return "misconfigured";
    if (res.status === 409) return "already";
    if (!res.ok) return "stale";
    return (await res.json()) as ClaimResult;
  } catch {
    return "offline";
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
        return "Сервер меня не узнал: у бота и сервера разный TELEGRAM_LINK_SECRET. Ссылка тут ни при чём.";
      case "offline":
        return "Сервер не отвечает. Попробуй через минуту.";
      case "stale":
        return "Ссылка устарела. Открой профиль на странице и нажми «Привязать» ещё раз.";
    }
  }
  switch (result.kind) {
    case "linked":
      return "Готово — Telegram привязан. Возвращайся на страницу.";
    case "switch":
      return `С возвращением${result.name ? `, ${result.name}` : ""}. На странице ты снова это ты.`;
    case "conflict":
      // СЛИЯНИЕ НЕОБРАТИМО, поэтому здесь его не предлагают даже кнопкой: человек решает сам, каким
      // аккаунтом он хочет быть.
      return "Этот Telegram уже привязан к другому аккаунту. Войди им — или отвяжи телеграм там.";
  }
}
