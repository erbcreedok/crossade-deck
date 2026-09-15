// ЧТО БОТ ГОВОРИТ ПРО СТОЛЫ — только слова и кнопки, без Telegram. Кнопка здесь — описание
// (`url`, `app`, `data`), а в клавиатуру grammy её превращает `tableBot.ts`: так слова проверяются
// тестом без бота.

import type { RoomCard } from "../../../server/src/table/contract.js";

export type Button =
  | { text: string; url: string }
  /** `web_app` — только в личке с ботом; там стол открывается с подписью Telegram. */
  | { text: string; app: string }
  | { text: string; data: string };

export interface Said {
  text: string;
  rows: Button[][];
}

export interface Links {
  /** Ссылка, которая откроет стол в любом чате: Mini App, если он заведён, иначе браузер. */
  anywhere(room: string): string;
  /** Адрес для `web_app` в личке. */
  app(room: string): string;
}

export const DOWN = "Столы сейчас недоступны: сервер стола выключен. Попробуй позже.";

/** Кнопка входа: в личке — Mini App прямо здесь, в группе и в чужой переписке — ссылкой. */
export function enter(room: string, links: Links, inPrivate: boolean, text = "Играть"): Button {
  return inPrivate ? { text, app: links.app(room) } : { text, url: links.anywhere(room) };
}

const who = (card: RoomCard) => (card.people.length ? ` · за столом: ${card.people.map((p) => p.name).join(", ")}` : "");

export function opened(card: RoomCard, total: number, links: Links, inPrivate: boolean): Said {
  const more = total > 1 ? `\nВ этом чате столов: ${total} — список: /tables` : "";
  return { text: `Стол «${card.title}» открыт.${more}`, rows: [[enter(card.room, links, inPrivate)]] };
}

export function listed(cards: RoomCard[], links: Links, inPrivate: boolean): Said {
  if (cards.length === 0) return { text: "В этом чате столов нет. Открыть: /table [название]", rows: [] };
  return {
    text: [`Столы этого чата (${cards.length}):`, ...cards.map((c, i) => `${i + 1}. ${c.title}${who(c)}`)].join("\n"),
    rows: cards.map((c) => [
      enter(c.room, links, inPrivate, c.title),
      { text: "Управлять", data: `tbm:${c.room}` },
      { text: "Переименовать", data: `tbl:ren:${c.room}` },
      { text: "Закрыть", data: `tbl:del:${c.room}` },
    ]),
  };
}

export const closed = (title: string): string => `Стол «${title}» закрыт.`;
export const renamed = (from: string, to: string): string => `Стол «${from}» теперь называется «${to}».`;
export const askTitle = (title: string): string => `Как назвать стол «${title}»? Напиши следующим сообщением.`;
export const gone = "Такого стола уже нет.";

/** Сервер стола перезапустился или замолчал — столы этого чата умерли вместе с ним. */
export function lost(titles: string[], why: "restart" | "down"): string {
  const list = titles.map((t) => `«${t}»`).join(", ");
  return why === "restart"
    ? `Сервер стола перезапустился, столы закрылись: ${list}. Открыть новый: /table`
    : `Сервер стола выключился, столы закрылись: ${list}.`;
}

/** Карточка выбрана и стала сообщением — теперь имя комнаты известно, и оно пишется в текст и на кнопку. */
export function inlineOpened(card: RoomCard, links: Links): Said {
  return { text: `Стол «${card.title}» открыт — заходи.`, rows: [[enter(card.room, links, false, card.title)]] };
}

export function inviteArticle(room: string, links: Links): { title: string; description: string; text: string; button: Button } {
  return {
    title: "Стол (карты, HTML)",
    description: "Открыть общий стол здесь",
    text: "Стол открыт — заходи.",
    button: enter(room, links, false),
  };
}
