// ДЕТАЛИ — вещи, собранные хозяином из картинок библиотеки: на каждый ракурс (лицо, бок, спина, левый бок, верх,
// низ) — своя картинка, или отражение другого ракурса, или ничего; у каждого ракурса свои сдвиг и величина
// относительно середины детали, в единицах стола. У детали нет вида: шар — это и голова, и ком снеговика, кубик —
// и голова, и тело; кем деталь встанет, решается в фигуре. У детали — имя, теги, ширина в единицах стола и как она
// стоит к камере (`facing`, `skins.ts`).
//
// Картинка ракурса — ссылка: своя картинка библиотеки (`table_sprites`, 12 знаков) или сторона встроенной детали
// каталога (`b:<деталь>:<ракурс>`, как в библиотеке на странице хозяина).

import type { Facing } from "./skins.js";

export const DETAIL_VIEWS = ["front", "right", "back", "left", "top", "bottom"] as const;
export type DetailView = (typeof DETAIL_VIEWS)[number];
export const FACINGS: readonly Facing[] = ["camera", "box", "view", "tilt"];

export interface ViewSetup {
  /** Картинка ракурса — или нет её, и тогда `mirror`. */
  sprite?: string;
  /** Ракурс берётся отражением другого: левый бок — это правый наоборот. */
  mirror?: DetailView;
  /** Сдвиг вправо и вверх от середины детали, в единицах стола. */
  dx: number;
  dy: number;
  /** Во сколько раз больше обычной ширины детали. */
  scale: number;
}

export interface Detail {
  id: string;
  name: string;
  /** Набор, персонаж, что угодно — по ним ищут. */
  tags: string[];
  /** Ширина детали в единицах стола при величине ×1. */
  width: number;
  facing: Facing;
  views: Partial<Record<DetailView, ViewSetup>>;
  at: number;
}

export const DETAIL_LIMITS = { dx: [-5, 5], dy: [-5, 5], scale: [0.2, 5], width: [0.2, 20] } as const;
export const DETAIL_WIDTH = 2.4;
const NAME_MAX = 40;
const SPRITE_REF = /^(?:[a-f0-9]{12}|b:[a-z0-9-]+:(?:head|hair|body|legs|hands):[a-z0-9]+)$/;

const num = (raw: unknown, [lo, hi]: readonly [number, number], or: number): number => {
  const v = typeof raw === "number" && Number.isFinite(raw) ? raw : or;
  return Math.round(Math.min(hi, Math.max(lo, v)) * 1000) / 1000;
};

/**
 * ДЕТАЛЬ ИЗ СЕТИ — только то, что можно: имя, теги (до десяти коротких), ширина в границах, как стоит к камере из
 * списка; ракурсы — из шести, у каждого картинка-ссылка или отражение ракурса С КАРТИНКОЙ (отражение отражения и
 * пустоты отбрасывается), числа — в границах. Без имени — `null`.
 */
export function cleanDetail(raw: unknown): Omit<Detail, "id" | "at"> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, NAME_MAX) : "";
  if (!name) return null;
  const list = Array.isArray(r.tags) ? r.tags : typeof r.tags === "string" ? r.tags.split(",") : [];
  const tags = [...new Set(list.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, 24)).filter(Boolean))].slice(0, 10);
  const width = num(r.width, DETAIL_LIMITS.width, DETAIL_WIDTH);
  const facing = (FACINGS as readonly string[]).includes(r.facing as string) ? (r.facing as Facing) : "tilt";
  const given = r.views && typeof r.views === "object" ? (r.views as Record<string, unknown>) : {};
  const drawn = new Set<DetailView>();
  for (const v of DETAIL_VIEWS) {
    const one = given[v] as Record<string, unknown> | undefined;
    if (one && typeof one.sprite === "string" && SPRITE_REF.test(one.sprite)) drawn.add(v);
  }
  const views: Partial<Record<DetailView, ViewSetup>> = {};
  for (const v of DETAIL_VIEWS) {
    const one = given[v] as Record<string, unknown> | undefined;
    if (!one || typeof one !== "object") continue;
    const place = { dx: num(one.dx, DETAIL_LIMITS.dx, 0), dy: num(one.dy, DETAIL_LIMITS.dy, 0), scale: num(one.scale, DETAIL_LIMITS.scale, 1) };
    if (drawn.has(v)) views[v] = { sprite: one.sprite as string, ...place };
    else if (typeof one.mirror === "string" && one.mirror !== v && drawn.has(one.mirror as DetailView)) views[v] = { mirror: one.mirror as DetailView, ...place };
  }
  return { name, tags, width, facing, views };
}
