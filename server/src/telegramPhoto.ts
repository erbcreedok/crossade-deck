// ЛИЦО ИЗ ТЕЛЕГИ — БАЙТАМИ, А НЕ ССЫЛКОЙ.
//
// Ссылка на файл телеги содержит токен бота (`api.telegram.org/file/bot<токен>/…`): отдать её на
// страницу значит отдать самого бота. Поэтому файл забирает сервер своим токеном и кладёт в профиль
// как обычную картинку — `data:`-строку.
//
// ПОЧЕМУ НЕ ПРОКСИ-МАРШРУТ: аватар — это строка профиля, такая же, как эмодзи. Картинка, живущая
// за нашим маршрутом, ломается в тот день, когда человек отвяжет телеграм, — а он отвязал ДВЕРЬ, а
// не лицо, которое уже выбрал себе сам.

/** Больше этого лицо не берём: аватар рисуется кружком в 64 px, а не обоями. */
export const MAX_PHOTO_BYTES = 300 * 1024;

/**
 * ЧТО ЭТО ЗА КАРТИНКА — ПО САМИМ БАЙТАМ, А НЕ ПО ЗАГОЛОВКУ.
 *
 * Файловый сервер телеги отвечает `application/octet-stream` на любую картинку — проверка заголовка
 * отбрасывала настоящие лица и пропустила бы чужой файл, назовись он `image/jpeg`. Первые байты
 * врать не умеют.
 */
export function imageTypeOf(bytes: Buffer): string | undefined {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (bytes.length > 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return undefined;
}

/**
 * Забрать файл по его ключу и превратить в `data:`-строку. `undefined` — телега не ответила, файл
 * не картинка или он слишком тяжёлый: во всех трёх случаях предлагать нечего, и об этом просто не
 * спросят.
 */
export async function photoDataUrl(
  token: string,
  fileId: string,
  call: typeof globalThis.fetch = globalThis.fetch,
): Promise<string | undefined> {
  try {
    const asked = await call(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
    if (!asked.ok) return undefined;
    const body = (await asked.json()) as { ok?: boolean; result?: { file_path?: string; file_size?: number } };
    const path = body.ok ? body.result?.file_path : undefined;
    if (!path) return undefined;
    if ((body.result?.file_size ?? 0) > MAX_PHOTO_BYTES) return undefined;

    const file = await call(`https://api.telegram.org/file/bot${token}/${path}`);
    if (!file.ok) return undefined;
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.byteLength > MAX_PHOTO_BYTES) return undefined;
    const type = imageTypeOf(bytes);
    if (!type) return undefined;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return undefined;
  }
}
