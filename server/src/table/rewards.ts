// НАГРАДЫ — ЧТО ЕСТЬ У ЧЕЛОВЕКА ИЗ ЧАСТЕЙ СКИНА (`skins.ts`). Все части не открыты всем: вначале у каждого только
// шар и палка (`STARTER`), остальное приходит наградой, и приходит оно в личку от бота (`giftMail.ts`):
//   - вошёл через Telegram — подарок за Telegram: голова-аватар, кружок с его фото (`AVATAR`);
//   - с Telegram впервые сел в комнату (любую, хоть одному) — случайный король, дама или валет колоды: голова,
//     тело и ноги двора.
// Гость приложения без Telegram наград не получает: писать ему некуда.
//
// Чистые правила; где что лежит, решает `db/tableOwnedRepo.ts`.

import { AVATAR, PARTS, partOf, SETS, SLOTS, type Parts, type SkinSet } from "./skins.js";

/** С чем приходит каждый: палка, её ноги, простой шар-голова, руки. */
export const STARTER_SET = "stick";
export const STARTER: readonly string[] = [...new Set([...Object.values(SETS.find((s) => s.id === STARTER_SET)!.parts), "none:hair"])];
export { AVATAR };

/** Фигуры колоды — из них награда за первую комнату. */
const COURT_SETS = SETS.filter((s) => partOf(s.parts.body)?.art.kind === "court");

/** За что награда: `telegram` — вошёл через Telegram, `room` — с Telegram сел в комнату. */
export type GiftWhy = "telegram" | "room";

export interface Gift {
  why: GiftWhy;
  /** Набор, если награда — целая фигура. */
  set?: string;
  name: string;
  parts: string[];
}

/**
 * ВСЁ ОТКРЫТО — только для прогонов (`TABLE_OWN_ALL=1`, как `TABLE_GUESTS`): проверки отрисовки кукол не должны
 * проходить через награды. На живом столе не задаётся.
 */
export const ownAll = (): boolean => typeof process !== "undefined" && process.env?.TABLE_OWN_ALL === "1";

/** Что есть у человека: стартовое и полученное (в прогоне «всё открыто» — всё). */
export const ownedOf = (got: readonly string[]): Set<string> => new Set(ownAll() ? PARTS.map((p) => p.id) : [...STARTER, ...got]);

/** Готовые наборы, которые целиком есть у человека. */
export const setsOwned = (owned: ReadonlySet<string>): SkinSet[] => SETS.filter((s) => SLOTS.every((k) => owned.has(s.parts[k])));

/** Ключ человека из Telegram — ему есть куда писать. */
export const viaTelegram = (key: string): boolean => key.startsWith("tg:");

/**
 * КАКИЕ НАГРАДЫ ЕМУ ПОЛОЖЕНЫ СЕЙЧАС: `inRoom` — он садится в комнату (а не открыл профиль). Каждая — один раз:
 * что уже есть, второй раз не приходит. `pick` — случайное число [0, 1), подменяется в проверках.
 */
export function giftsDue(key: string, owned: ReadonlySet<string>, inRoom: boolean, pick: () => number = Math.random): Gift[] {
  if (!viaTelegram(key)) return [];
  const out: Gift[] = [];
  if (!owned.has(AVATAR)) out.push({ why: "telegram", name: "Аватар из Telegram", parts: [AVATAR] });
  if (inRoom && !COURT_SETS.some((s) => owned.has(s.parts.body))) {
    const set = COURT_SETS[Math.min(COURT_SETS.length - 1, Math.floor(pick() * COURT_SETS.length))]!;
    out.push({ why: "room", set: set.id, name: set.name, parts: [set.parts.head, set.parts.body, set.parts.legs] });
  }
  return out;
}

/**
 * НАДЕТЬ ПОЛУЧЕННОЕ, если сидит стартовым: шар-голова меняется на аватар, палка — на фигуру целиком. Что выбрал
 * сам — не трогается. Отвечает, что записать в профиль, или `null`, если ничего.
 */
export function putOn(worn: Parts, gifts: readonly Gift[]): { doll?: string; parts: Partial<Parts> | null } | null {
  const figure = gifts.find((g) => g.set);
  if (figure && worn.body === "stick:body") return { doll: figure.set!, parts: null };
  if (gifts.some((g) => g.parts.includes(AVATAR)) && worn.head === "ball:head") return { parts: { head: AVATAR } };
  return null;
}

/** Сборка, которой можно сидеть: часть, которой у человека нет, заменяется стартовой того же слота. */
export function wearable(parts: Parts, owned: ReadonlySet<string>): Parts {
  const starter = SETS.find((s) => s.id === STARTER_SET)!.parts;
  const out = { ...parts };
  for (const slot of SLOTS) if (!owned.has(out[slot])) out[slot] = starter[slot];
  return out;
}

/** Что написать в личку о награде. */
export function giftText(gift: Gift): string {
  if (gift.why === "telegram") return "🎁 Подарок за вход через Telegram: твой аватар — кружок с фото — теперь голова твоей фигуры за столом.\nСменить — в профиле, «Кем сидеть».";
  return `🎁 Тебе пришёл новый скин: ${gift.name} — голова, тело и ноги.\nНадеть или сменить — в профиле комнаты, «Кем сидеть».`;
}
