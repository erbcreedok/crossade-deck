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

export const DOWN = "Комнаты сейчас недоступны: сервер выключен. Попробуй позже.";

/** Кнопка входа: в личке — Mini App прямо здесь, в группе и в чужой переписке — ссылкой. */
export function enter(room: string, links: Links, inPrivate: boolean, text = "Играть"): Button {
  return inPrivate ? { text, app: links.app(room) } : { text, url: links.anywhere(room) };
}

const who = (card: RoomCard) => (card.people.length ? ` · внутри: ${card.people.map((p) => p.name).join(", ")}` : "");

export function opened(card: RoomCard, total: number, links: Links, inPrivate: boolean): Said {
  const more = total > 1 ? `\nВ этом чате комнат: ${total} — список: /tables` : "";
  return { text: `«${card.title}» открыта.${more}`, rows: cardRows(card.room, links, inPrivate) };
}

/**
 * СПИСОК СТОЛОВ. В группе это столы группы. В ЛИЧКЕ — все столы этого человека: и те, что он открыл, и те,
 * за которыми сидит. Управлять можно только своими (он там админ), в чужие — просто зайти.
 */
export function listed(cards: RoomCard[], links: Links, inPrivate: boolean, me?: string): Said {
  if (cards.length === 0) {
    return { text: inPrivate ? "Ты пока ни в одной комнате. Открыть: /table [название]" : "В этом чате комнат нет. Открыть: /table [название]", rows: [] };
  }
  const mine = (c: RoomCard) => me !== undefined && c.by === me;
  // ГДЕ СТОЛ ЖИВЁТ — в личке это важнее всего: столов много, и все они «где-то там».
  const where = (c: RoomCard) => {
    if (!inPrivate) return "";
    if (c.home.kind === "inline") return " · в переписке";
    return c.home.chatTitle ? ` · чат «${c.home.chatTitle}»` : " · в чате";
  };
  return {
    text: [
      inPrivate ? `Твои комнаты (${cards.length}):` : `Комнаты этого чата (${cards.length}):`,
      ...cards.map((c, i) => `${i + 1}. ${c.title}${mine(c) ? " · твой" : ""}${where(c)}${who(c)}`),
    ].join("\n"),
    rows: cards.map((c) =>
      mine(c) || !inPrivate
        ? [
            enter(c.room, links, inPrivate, c.title),
            { text: "Управлять", data: `tbm:${c.room}` },
            { text: "Переименовать", data: `tbl:ren:${c.room}` },
            { text: "Закрыть", data: `tbl:del:${c.room}` },
          ]
        : [enter(c.room, links, inPrivate, c.title)],
    ),
  };
}

export const recast = (title: string, kind: string): string => `«${title}» теперь ${kind}. Карты и люди остались на местах.`;
export const closed = (title: string): string => `«${title}» закрыта.`;
export const renamed = (from: string, to: string): string => `«${from}» теперь называется «${to}».`;
export const askTitle = (title: string): string => `Как назвать «${title}»? Напиши следующим сообщением.`;
export const gone = "Такой комнаты уже нет.";
export const notYours = "Это не твоя комната.";
export const notOwner = "Роли раздаёт хозяин комнаты — тот, кто её открыл.";
export const roleSaid = (name: string, on: boolean): string =>
  on ? `${name} теперь распорядитель: ведёт стол, но комнату не закрывает и ролей не раздаёт.` : `${name} больше не распорядитель.`;

/**
 * КАКИМ СТОЛОМ Я ВПРАВЕ РАСПОРЯЖАТЬСЯ. В личке бот показывает и столы из других чатов — те, что человек
 * завёл или за которыми сидит. Кнопки под этим списком обязаны искать стол ТАМ ЖЕ, где он взят для списка:
 * иначе свой же стол из другого чата кнопке не виден и она отвечает «такого стола уже нет».
 *
 * Чужим столом, доехавшим в список потому, что я за ним сижу, распоряжаться нельзя.
 */
export function mayManage(card: { room: string; by?: string } | undefined, by: string, here: ReadonlySet<string>): "yes" | "gone" | "foreign" {
  if (!card) return "gone";
  return here.has(card.room) || (Boolean(card.by) && card.by === by) ? "yes" : "foreign";
}

/** Сервер стола перезапустился или замолчал — столы этого чата умерли вместе с ним. */
export function lost(titles: string[], why: "restart" | "down"): string {
  const list = titles.map((t) => `«${t}»`).join(", ");
  return why === "restart"
    ? `Сервер перезапустился, комнаты закрылись: ${list}. Открыть новую: /table`
    : `Сервер выключился, комнаты закрылись: ${list}.`;
}

/** Карточка выбрана и стала сообщением — теперь имя комнаты известно, и оно пишется в текст и на кнопку. */
export function inlineOpened(card: RoomCard, links: Links): Said {
  return { text: `«${card.title}» открыта — заходи.`, rows: cardRows(card.room, links, false, card.title) };
}

/** Готовый стол карточкой в чужую переписку: имя, где живёт, и кнопка входа; админу — ещё «Управлять». */
export function inviteExisting(card: RoomCard, links: Links, admin: boolean): { title: string; description: string; text: string; rows: Button[][] } {
  const where = card.home.kind === "inline" ? "в переписке" : card.home.chatTitle ? `чат «${card.home.chatTitle}»` : "в чате";
  return {
    title: card.title,
    description: `Позвать в эту комнату · ${where}`,
    text: `«${card.title}» — заходи.`,
    rows: [admin ? [enter(card.room, links, false, "Играть"), { text: "Управлять", data: `tbm:${card.room}` }] : [enter(card.room, links, false, "Играть")]],
  };
}

/**
 * КАРТОЧКА НОВОГО СТОЛА — по одной на род (`desks.ts`). Род выбирается здесь и только здесь: дальше
 * он едет с комнатой, и ни бот, ни стол больше про него не спрашивают.
 */
export function inviteArticle(kind: string, name: string, room: string, links: Links): { title: string; description: string; text: string; button: Button } {
  return {
    title: `Новая комната · ${name}`,
    description: kind === "sandbox" ? "Комната без правил: раскладывай руками" : `Комната с правилами: ${name}`,
    text: `«${name}» открыта — заходи.`,
    button: enter(room, links, false),
  };
}

/** Карточка только что открытого стола: вход для всех и «Меню» — для хозяина. */
export const cardRows = (room: string, links: Links, inPrivate: boolean, title = "Играть"): Button[][] => [
  [enter(room, links, inPrivate, title), { text: "Меню", data: `tbm:${room}` }],
];
