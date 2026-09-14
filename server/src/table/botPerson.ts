// БОТ СТОЛА КАК УЧАСТНИК — тот, кто он есть в Telegram: имя `@CrossaderBot` и его аватар.
//
// Аватар спрашивается у Bot API один раз за запуск и уходит клиентам картинкой `data:`: ссылка на файл
// Telegram содержит токен бота, и отдавать её в сеть нельзя.

import type { Person } from "./contract.js";

export const BOT_KEY = "bot:table";

let cached: Promise<Omit<Person, "ink">> | null = null;

export function botPerson(token: string | undefined, http: typeof fetch = fetch): Promise<Omit<Person, "ink">> {
  cached ??= load(token, http);
  return cached;
}

async function load(token: string | undefined, http: typeof fetch): Promise<Omit<Person, "ink">> {
  const plain: Omit<Person, "ink"> = { key: BOT_KEY, name: "CrossaderBot", door: "telegram", bot: true };
  // Тесты в Telegram не ходят.
  if (!token || process.env.VITEST) return plain;
  try {
    const api = async <T>(method: string, query = ""): Promise<T> => {
      const res = await http(`https://api.telegram.org/bot${token}/${method}${query}`);
      const body = (await res.json()) as { ok: boolean; result: T };
      if (!body.ok) throw new Error(method);
      return body.result;
    };
    const me = await api<{ id: number; username?: string; first_name: string }>("getMe");
    const named = { ...plain, name: me.username ?? me.first_name, ...(me.username ? { username: me.username } : {}) };
    const photos = await api<{ photos: { file_id: string; width: number }[][] }>("getUserProfilePhotos", `?user_id=${me.id}&limit=1`);
    const sizes = photos.photos[0];
    if (!sizes?.length) return named;
    const small = [...sizes].sort((a, b) => a.width - b.width).find((s) => s.width >= 96) ?? sizes.at(-1)!;
    const file = await api<{ file_path: string }>("getFile", `?file_id=${small.file_id}`);
    const bytes = await (await http(`https://api.telegram.org/file/bot${token}/${file.file_path}`)).arrayBuffer();
    return { ...named, photo: `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}` };
  } catch {
    cached = null;
    return plain;
  }
}
