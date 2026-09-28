// ССЫЛКА В ПРИЛОЖЕНИЕ ОТ БОТА — тот же пропуск, что выдаёт стол в настройках Mini App (`appPass.ts`), но без
// Mini App: боту Telegram сам говорит, кто пишет, и бот подписывает его тем же секретом стола.
//
// Только в личке. Пропуск сажает за стол ТОБОЙ — в общем чате его нажал бы любой.

import { KEY_DAYS, mintAppKey, type Bearer } from "../../../server/src/table/appPass.js";
import type { RoomCard } from "../../../server/src/table/contract.js";
import type { Button } from "./talk.js";

/** Человек из Telegram так, как его назвал бы стол (`identity.ts`): имя, фамилия, иначе ник, иначе номер. */
export function bearerOf(from: { id: number; first_name?: string; last_name?: string; username?: string }): Bearer {
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || `#${from.id}`;
  return { key: `tg:${from.id}`, name, ...(from.username ? { username: from.username } : {}) };
}

/**
 * Кнопки «открыть в приложении»: первая — «Мои комнаты», дальше по одной на стол. В каждой — КЛЮЧ приложения
 * (`appPass.ts`): он называет человека, а не стол, и приложение с ним открывает список и любой его стол.
 * Адрес ведёт на переход мака (`/table/app`).
 */
export function appLinks(cards: RoomCard[], who: Bearer, host: string, secret: string, now = Date.now()): { text: string; rows: Button[][] } {
  const key = mintAppKey(who, secret, now + KEY_DAYS * 24 * 60 * 60 * 1000);
  const link = (room?: string): string => {
    const url = new URL(`${host}/table/app`);
    if (room) url.searchParams.set("room", room);
    url.searchParams.set("key", key);
    url.searchParams.set("host", host);
    return url.toString();
  };
  return {
    text: `Открыть в приложении Crossade — войдёшь собой. Ключ в ссылках живёт ${KEY_DAYS} дней; не пересылай их: по ним входят тобой.`,
    rows: [[{ text: "Мои комнаты", url: link() }], ...cards.slice(0, 8).map((card) => [{ text: card.title || "Стол", url: link(card.room) }])],
  };
}
