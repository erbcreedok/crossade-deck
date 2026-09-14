// КТО ПРИШЁЛ — по двери, через которую он вошёл.
//
// Дверь — это способ доказать себя, и способов у стола два. Telegram подписывает `initData` токеном
// бота: подпись сошлась — перед нами этот человек, и ключ его — номер в Telegram, одинаковый в любом
// клиенте. Гость не доказывает ничего: пускается, только если серверу это разрешено (браузер на
// ноутбуке у разработчика), и ключ его живёт, пока живёт соединение.
//
// Новая дверь (аккаунт хаба, например) — ещё одна ветка здесь, и больше нигде: комната спрашивает
// только `Person`.

import { verifyTelegramInitData } from "../telegramAuth.js";
import type { JoinOptions, Person } from "./contract.js";

export interface Doors {
  botToken?: string;
  guests: boolean;
}

export type Who = Omit<Person, "ink">;

export function whoIs(options: Partial<JoinOptions>, session: string, doors: Doors, now = Date.now()): Who | null {
  if (options.door === "telegram") {
    if (!doors.botToken || typeof options.initData !== "string") return null;
    const user = verifyTelegramInitData(options.initData, doors.botToken, now);
    if (!user) return null;
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || `#${user.id}`;
    return { key: `tg:${user.id}`, name, door: "telegram", ...(user.photo_url ? { photo: user.photo_url } : {}) };
  }
  if (options.door === "guest" && doors.guests) {
    const name = typeof options.name === "string" && options.name.trim() ? options.name.trim().slice(0, 24) : "Гость";
    return { key: `guest:${session}`, name, door: "guest" };
  }
  return null;
}
