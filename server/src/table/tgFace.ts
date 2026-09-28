// ЛИЦО ИЗ TELEGRAM, КОГДА ЕГО НЕ ПРИНЕСЛИ. Мини-апп получает `photo_url` в подписи только при запуске из меню
// вложений; из кнопки бота и по ссылке — нет, и у человека вместо его фото был бы пустой кружок. Тогда фото
// спрашивается у Bot API (`getUserProfilePhotos`) токеном стола и уходит картинкой `data:` — ссылка на файл
// Telegram содержит токен, отдавать её нельзя (`telegramPhoto.ts`).
//
// Одно на человека за запуск процесса (и «нет фото» тоже запоминается — на час, чтобы не спрашивать на каждый вход).

import { photoDataUrl } from "../telegramPhoto.js";

const HOUR = 60 * 60 * 1000;
const known = new Map<string, { at: number; face: Promise<string | undefined> }>();

/** Фото человека `tg:<id>` картинкой `data:`; нет токена, нет фото, тест — `undefined`. */
export function tgFace(key: string, token: string | undefined, http: typeof fetch = fetch, now = Date.now()): Promise<string | undefined> {
  const id = key.startsWith("tg:") ? key.slice(3) : null;
  // Тесты в Telegram не ходят — кроме тех, что сами подставили `http`.
  if (!id || !token || (process.env.VITEST && http === fetch)) return Promise.resolve(undefined);
  const was = known.get(id);
  if (was && now - was.at < HOUR) return was.face;
  const asked = load(id, token, http);
  const face = asked.then((got) => got.face);
  known.set(id, { at: now, face });
  // Фото есть — держится весь запуск; Telegram ответил «фото нет» — через час спросим снова (вдруг поставил);
  // не дозвались (сеть, сбой) — не запоминается: следующий вход спросит снова.
  void asked.then((got) => {
    if (got.face) known.set(id, { at: Infinity, face });
    else if (!got.none) known.delete(id);
  });
  return face;
}

async function load(id: string, token: string, http: typeof fetch): Promise<{ face?: string; none?: boolean }> {
  try {
    const res = await http(`https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${encodeURIComponent(id)}&limit=1`);
    const body = (await res.json()) as { ok?: boolean; description?: string; result?: { photos?: { file_id: string; width: number }[][] } };
    if (!body.ok) throw new Error(`getUserProfilePhotos: ${body.description ?? res.status}`);
    const sizes = body.result?.photos?.[0];
    if (!sizes?.length) return { none: true };
    // Кружок — до ~100 px: самый маленький не меньше 96, иначе самый большой.
    const small = [...sizes].sort((a, b) => a.width - b.width).find((s) => s.width >= 96) ?? sizes.at(-1)!;
    const face = await photoDataUrl(token, small.file_id, http);
    if (!face) throw new Error("файл фото не получен");
    return { face };
  } catch (err) {
    console.error(`фото tg:${id} из Telegram не получено:`, String(err).replaceAll(token, "…").slice(0, 200));
    return {};
  }
}
