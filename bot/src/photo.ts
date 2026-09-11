// ЛИЦО ЧЕЛОВЕКА В ТЕЛЕГЕ — вернее, ключ к нему.
//
// Бот узнаёт у телеги `file_id` и НЕ СКАЧИВАЕТ ничего сам: ссылка на файл содержит токен бота
// (`api.telegram.org/file/bot<токен>/…`), и отдать её кому-нибудь значит отдать самого бота.
// Байты забирает сервер — своим токеном, на своей стороне (`telegramPhoto.ts`).

/** Какого размера лицо просим. Аватар рисуется 64 px, с запасом на плотные экраны — 160. */
const WANT_PX = 160;

interface PhotoSize {
  file_id: string;
  width: number;
  height: number;
}

/**
 * Ключ самого мелкого файла, который ещё не хуже, чем нужно, — а если все меньше, то самого
 * крупного из них. Телега отдаёт несколько размеров одной фотографии, и тащить оригинал на 800 px
 * ради кружка в 64 — это чужой трафик и чужая батарея.
 */
export function pickPhoto(sizes: readonly PhotoSize[] | undefined): string | undefined {
  if (!sizes || sizes.length === 0) return undefined;
  const sorted = [...sizes].sort((a, b) => a.width - b.width);
  return (sorted.find((one) => one.width >= WANT_PX) ?? sorted[sorted.length - 1])!.file_id;
}

/** Ключ к лицу этого человека, если оно у него вообще есть и открыто боту. */
export async function profilePhoto(
  token: string,
  telegramId: string,
  call: typeof globalThis.fetch = globalThis.fetch,
): Promise<string | undefined> {
  try {
    const res = await call(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${encodeURIComponent(telegramId)}&limit=1`,
    );
    if (!res.ok) return undefined;
    const body = (await res.json()) as { ok?: boolean; result?: { photos?: PhotoSize[][] } };
    if (!body.ok) return undefined;
    return pickPhoto(body.result?.photos?.[0]);
  } catch {
    // Нет лица — не беда: предложить будет нечего, и об этом просто не спросят.
    return undefined;
  }
}
