// ЛИЦО ЧЕЛОВЕКА ЗА СТОЛОМ — надетый снимок-аватар, а не то фото, что сейчас в Telegram. Каждое новое фото из
// Telegram запоминается ещё одним снимком (`db/tableAvatarsRepo.ts`), прежние остаются навсегда, и сидит человек
// тем, что выбрал (`table_profiles.avatar`; не выбирал — первым).

import { avatarsOf, keepAvatar, type Avatar } from "../db/tableAvatarsRepo.js";
import { tableProfile } from "../db/tableProfilesRepo.js";
import { tableConfig } from "./config.js";
import { viaTelegram } from "./rewards.js";
import { tgFace } from "./tgFace.js";

export interface Face {
  /** Лицо надетого снимка; снимков нет — что принесла подпись. */
  photo?: string;
  avatars: Avatar[];
  /** Номер надетого снимка. */
  worn?: number;
}

/** Лицо и снимки человека. `given` — фото из подписи (Login Widget, меню вложений). База недоступна — `given`. */
export async function faceOf(key: string, given?: string): Promise<Face> {
  if (!viaTelegram(key)) return { ...(given ? { photo: given } : {}), avatars: [] };
  // Байты — надёжнее ссылки: снимок не должен меняться вместе с фото в Telegram.
  const now = (await tgFace(key, tableConfig().botToken)) ?? given;
  try {
    if (now) keepAvatar(key, now);
    const avatars = avatarsOf(key);
    const chosen = tableProfile(key)?.avatar;
    const worn = avatars.find((a) => a.n === chosen) ?? avatars[0];
    return { ...(worn ? { photo: worn.photo, worn: worn.n } : now ? { photo: now } : {}), avatars };
  } catch {
    return { ...(now ? { photo: now } : {}), avatars: [] };
  }
}
