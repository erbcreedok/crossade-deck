// КТО ПРИШЁЛ — по двери, через которую он вошёл.
//
// Дверь — это способ доказать себя, и способов у стола три. Telegram подписывает `initData` токеном
// бота: подпись сошлась — перед нами этот человек, и ключ его — номер в Telegram, одинаковый в любом
// клиенте. Гость не доказывает ничего: пускается, только если серверу это разрешено (браузер на
// ноутбуке у разработчика), и ключ его живёт, пока живёт соединение. Приложение приносит пропуск, который
// стол сам выписал человеку, вошедшему через Telegram, — и входит под его ключом.
//
// Новая дверь (аккаунт хаба, например) — ещё одна ветка здесь, и больше нигде: комната спрашивает
// только `Person`.

import { verifyTelegramInitData } from "../telegramAuth.js";
import { appPassBearer } from "./appPass.js";
import type { JoinOptions, Person } from "./contract.js";

export interface Doors {
  botToken?: string;
  guests: boolean;
  /** Секрет стола: им подписан пропуск в приложение. Нет секрета — дверь `app` закрыта. */
  secret?: string;
}

export type Who = Omit<Person, "ink">;

export function whoIs(options: Partial<JoinOptions>, session: string, doors: Doors, now = Date.now()): Who | null {
  if (options.door === "telegram") {
    if (!doors.botToken || typeof options.initData !== "string") return null;
    const user = verifyTelegramInitData(options.initData, doors.botToken, now);
    if (!user) return null;
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || `#${user.id}`;
    return { key: `tg:${user.id}`, name, door: "telegram", ...(user.username ? { username: user.username } : {}), ...(user.photo_url ? { photo: user.photo_url } : {}) };
  }
  // ПРИЛОЖЕНИЕ — тот же человек, что уже вошёл через Telegram и взял у стола пропуск (`appPass.ts`).
  if (options.door === "app") {
    const who = doors.secret ? appPassBearer(options.pass, options.room, doors.secret, now) : null;
    return who && { ...who, door: "app" };
  }
  if (options.door === "guest" && doors.guests) {
    const name = typeof options.name === "string" && options.name.trim() ? options.name.trim().slice(0, 24) : "Гость";
    return { key: `guest:${session}`, name, door: "guest" };
  }
  return null;
}
