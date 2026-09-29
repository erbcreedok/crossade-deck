// ПРАВКИ ЧАСТЕЙ СКИНА — то, что хозяин подкручивает на странице `/table/admin` поверх каталога (`skins.ts`):
// величина части, сдвиг вбок и вверх, линия плеч на туловище, имя. Каталог остаётся в коде, правки — в базе
// (`tableTunesRepo.ts`), стол раздаёт их всем (`/table/tunes`), и слой тел и сцена профиля применяют их при рисовании.
//
// Одно место на сервер и клиент: разбор правки и чтение текущих — здесь, больше нигде.

import { addParts, partOf, type Part } from "./skins.js";

export interface PartTune {
  /** Во сколько раз больше обычного. */
  scale?: number;
  /** Сдвиг вправо (от лица части), в единицах стола. */
  dx?: number;
  /** Сдвиг вверх, в единицах стола. */
  dy?: number;
  /** Линия плеч на туловище — доля высоты рисунка сверху. */
  shoulder?: number;
  /** Имя части в конструкторе. */
  name?: string;
}

export interface Tunes {
  parts: Record<string, PartTune>;
  /** Когда менялись последний раз: клиент по нему видит, что пора перерисовать. */
  at: number;
  /** Части, принятые в каталог со страницы хозяина (`addParts`). */
  extra?: Part[];
}

/** Границы каждого поля: правка за ними обрезается, а не отвергается. */
export const TUNE_LIMITS = { scale: [0.3, 3], dx: [-5, 5], dy: [-5, 5], shoulder: [0, 1] } as const;
const NAME_MAX = 24;

/** Разбор правки из сети: только известные поля в своих границах; пустая правка — `null`. */
export function cleanTune(raw: unknown): PartTune | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: PartTune = {};
  for (const [k, [lo, hi]] of Object.entries(TUNE_LIMITS) as [keyof typeof TUNE_LIMITS, readonly [number, number]][]) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.round(Math.min(hi, Math.max(lo, v)) * 1000) / 1000;
  }
  if (typeof o.name === "string" && o.name.trim()) out.name = o.name.trim().slice(0, NAME_MAX);
  return Object.keys(out).length ? out : null;
}

let current: Tunes = { parts: {}, at: 0 };

/** Поставить правки, что пришли со стола (или из базы). Правки неизвестных частей отбрасываются. */
export function setTunes(next: Tunes): void {
  addParts(next.extra ?? []);
  const parts: Record<string, PartTune> = {};
  for (const [id, raw] of Object.entries(next.parts ?? {})) {
    const t = partOf(id) ? cleanTune(raw) : null;
    if (t) parts[id] = t;
  }
  current = { parts, at: next.at ?? 0, extra: next.extra ?? current.extra };
}

export const tunes = (): Tunes => current;

/** Правка части с обычными значениями на месте несданных. */
export function tuneOf(id: string): { scale: number; dx: number; dy: number; shoulder?: number } {
  const t = current.parts[id];
  return { scale: t?.scale ?? 1, dx: t?.dx ?? 0, dy: t?.dy ?? 0, shoulder: t?.shoulder };
}

/** Имя части — правленое или из каталога. */
export const partName = (id: string): string => current.parts[id]?.name ?? partOf(id)?.name ?? id;
