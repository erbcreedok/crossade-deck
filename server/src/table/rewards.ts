// НАГРАДЫ — ЧТО ЕСТЬ У ЧЕЛОВЕКА ИЗ ЧАСТЕЙ СКИНА (`skins.ts`). Все части не открыты всем: вначале у каждого только
// палка с кружком, в котором его аватар из Telegram (`STARTER`), остальное приходит наградой. Первая награда — на
// втором заходе в игру: случайный король, дама или валет колоды — голова, тело и ноги двора.
//
// Заход — вход за стол после перерыва не меньше `VISIT_GAP_MS`: перезагрузка страницы и переподключение — тот же
// заход. Чистые правила; где что лежит, решает `db/tableOwnedRepo.ts`.

import { PARTS, partOf, SETS, SLOTS, type Parts, type SkinSet } from "./skins.js";

/** С чем приходит каждый: палка, её ноги и кружок-голова (в нём — аватар из Telegram), руки. */
export const STARTER_SET = "stick";
export const STARTER: readonly string[] = [...new Set([...Object.values(SETS.find((s) => s.id === STARTER_SET)!.parts), "none:hair"])];

/** Перерыв, после которого вход за стол — новый заход. */
export const VISIT_GAP_MS = 30 * 60_000;
/** На каком заходе — первая награда. */
export const FIRST_GIFT_VISIT = 2;
/** Фигуры колоды — из них первая награда. */
const COURT_SETS = SETS.filter((s) => partOf(s.parts.body)?.art.kind === "court");

export interface Gift {
  set: string;
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

/**
 * НАГРАДА ЗА ЗАХОД: на `FIRST_GIFT_VISIT`-м — случайная фигура колоды, которой у него ещё нет (голова, тело и ноги
 * двора). Уже получал фигуру или все есть — ничего. `pick` — случайное число [0, 1), подменяется в проверках.
 */
export function giftFor(visits: number, owned: ReadonlySet<string>, pick: () => number = Math.random): Gift | null {
  if (visits !== FIRST_GIFT_VISIT) return null;
  if (COURT_SETS.some((s) => owned.has(s.parts.body))) return null;
  const left = COURT_SETS.filter((s) => !owned.has(s.parts.body));
  if (left.length === 0) return null;
  const set = left[Math.min(left.length - 1, Math.floor(pick() * left.length))]!;
  return { set: set.id, name: set.name, parts: [set.parts.head, set.parts.body, set.parts.legs] };
}

/** Сборка, которой можно сидеть: часть, которой у человека нет, заменяется стартовой того же слота. */
export function wearable(parts: Parts, owned: ReadonlySet<string>): Parts {
  const starter = SETS.find((s) => s.id === STARTER_SET)!.parts;
  const out = { ...parts };
  for (const slot of SLOTS) if (!owned.has(out[slot])) out[slot] = starter[slot];
  return out;
}
