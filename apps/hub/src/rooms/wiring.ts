// ЧЕМ ХАБ КОРМИТ МОСТ. Мост (`@game-presets/rooms`) не знает ни нашего сервера, ни наших игр —
// значит кто-то должен переводить одно в другое, и это место здесь.
//
// Перевод в одну сторону: комната сервера → комната моста. И в другую: один вопрос стенда «кто
// видит стол» → две оси, которыми это живёт в базе. Оси остаются осями: «публичная, но по коду» и
// «скрытая, но по ссылке» — разные вещи, и сводить их в один тумблер нельзя. Спрашивают один раз,
// хранят двумя полями.

import type { Openness, Room } from "@game-presets/rooms";
import type { Admission, RoomCard, Visibility } from "@crossade/wire";

/** Как один вопрос стенда ложится на две оси базы. */
export function axesOf(openness: Openness): { visibility: Visibility; admission: Admission } {
  if (openness === "public") return { visibility: "public", admission: "open" };
  if (openness === "friends") return { visibility: "friends", admission: "code" };
  return { visibility: "hidden", admission: "code" };
}

/** ...и обратно: по двум осям видно, как о комнате сказать одним словом. */
export function opennessOf(card: RoomCard): Openness {
  if (card.visibility === "public") return "public";
  if (card.visibility === "friends") return "friends";
  return "code";
}

/**
 * ВОЗРАСТ СВОИМИ СЛОВАМИ. «Создан 1789187925251» — это не ответ; человеку нужно понять, свежий стол
 * или вчерашний, а не узнать точное время.
 */
export function ageWords(createdAt: number, now = Date.now()): string {
  const minutes = Math.floor((now - createdAt) / 60_000);
  if (minutes < 2) return "только что";
  if (minutes < 60) return `${minutes} минут назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "час назад" : `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "вчера" : `${days} дн назад`;
}

export interface GameLook {
  readonly id: string;
  readonly name: string;
  readonly sign: string;
}

/** Комната сервера, какой её видит мост. */
export function roomForBridge(card: RoomCard, game: GameLook, now = Date.now()): Room {
  return {
    code: card.code ?? "",
    group: card.group ?? "public",
    game,
    seats: card.seats ?? 2,
    taken: card.taken,
    online: card.online,
    people: card.people.map((one) => ({ name: one.name, color: one.color ?? null, ...(one.away ? { away: true } : {}) })),
    openness: opennessOf(card),
    mode: card.mode,
    forever: card.forever,
    owner: card.owner,
    age: ageWords(card.createdAt, now),
    ...(card.mySeat ? { mySeat: true } : {}),
    ...(card.myTurn ? { myTurn: true } : {}),
  };
}
