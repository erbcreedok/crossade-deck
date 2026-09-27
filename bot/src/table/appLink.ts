// ССЫЛКА В ПРИЛОЖЕНИЕ ОТ БОТА — тот же пропуск, что выдаёт стол в настройках Mini App (`appPass.ts`), но без
// Mini App: боту Telegram сам говорит, кто пишет, и бот подписывает его тем же секретом стола.
//
// Только в личке. Пропуск сажает за стол ТОБОЙ — в общем чате его нажал бы любой.

import { mintAppPass, type Bearer } from "../../../server/src/table/appPass.js";
import { PASS_HOURS } from "../../../server/src/table/pass.js";
import type { RoomCard } from "../../../server/src/table/contract.js";
import type { Button } from "./talk.js";

/** Человек из Telegram так, как его назвал бы стол (`identity.ts`): имя, фамилия, иначе ник, иначе номер. */
export function bearerOf(from: { id: number; first_name?: string; last_name?: string; username?: string }): Bearer {
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || `#${from.id}`;
  return { key: `tg:${from.id}`, name, ...(from.username ? { username: from.username } : {}) };
}

/** Кнопки «открыть в приложении» — по одной на стол; адрес ведёт на переход мака (`/table/app`). */
export function appLinks(cards: RoomCard[], who: Bearer, host: string, secret: string, now = Date.now()): { text: string; rows: Button[][] } {
  if (cards.length === 0) return { text: "Столов нет. Открой стол в чате: /table, потом возвращайся сюда за /app.", rows: [] };
  const until = now + PASS_HOURS * 60 * 60 * 1000;
  const rows = cards.slice(0, 8).map((card) => {
    const url = new URL(`${host}/table/app`);
    url.searchParams.set("room", card.room);
    url.searchParams.set("pass", mintAppPass(card.room, who, secret, until));
    url.searchParams.set("host", host);
    return [{ text: card.title || "Стол", url: url.toString() }];
  });
  return {
    text: `Открыть в приложении Crossade AR — сядешь за стол собой. Ссылки живут ${PASS_HOURS} часов; не пересылай их: по ним садятся тобой.`,
    rows,
  };
}
