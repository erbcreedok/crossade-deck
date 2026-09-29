// ДЕТАЛИ — вещи, собранные хозяином из картинок библиотеки. Набор ракурсов — шесть сторон (лицо, бок, спина, левый
// бок, верх, низ: кубик) или N ракурсов по кругу через равный угол (`a0`, `a20`…: бочка); на каждый — своя картинка,
// или отражение другого ракурса, или ничего; у каждого ракурса свои сдвиг и величина относительно середины детали,
// в единицах стола. Набор можно сменить — картинки переедут на ближайшие по углу ракурсы (`moveViews`). У детали нет вида: шар — это и голова, и ком снеговика, кубик —
// и голова, и тело; кем деталь встанет, решается в фигуре. У детали — имя, теги, ширина в единицах стола и как она
// стоит к камере (`facing`, `skins.ts`).
//
// Картинка ракурса — ссылка: своя картинка библиотеки (`table_sprites`, 12 знаков) или сторона встроенной детали
// каталога (`b:<деталь>:<ракурс>`, как в библиотеке на странице хозяина).

import type { Facing } from "./skins.js";

export const DETAIL_VIEWS = ["front", "right", "back", "left", "top", "bottom"] as const;
/** Ракурс: сторона из шести или угол по кругу (`a40` — 40° от лица к правому боку). */
export type DetailView = string;
export const RING_LIMITS = [3, 36] as const;
/** Ракурсы по кругу: `n` штук через равный угол, от лица. */
export const ringViews = (n: number): string[] => Array.from({ length: n }, (_, k) => `a${Math.round((k * 360) / n)}`);
/** Ракурсы детали — по её набору. */
export const viewsOf = (d: { ring?: number }): string[] => (d.ring ? ringViews(d.ring) : [...DETAIL_VIEWS]);
const SIDE_ANGLE: Record<string, [yaw: number, pitch: number]> = { front: [0, 0], right: [90, 0], back: [180, 0], left: [270, 0], top: [0, 90], bottom: [0, -90] };
/** Куда смотрит ракурс: угол вокруг вертикали от лица к правому боку и наклон (верх — 90). */
export function viewAngle(v: string): { yaw: number; pitch: number } {
  const side = SIDE_ANGLE[v];
  if (side) return { yaw: side[0], pitch: side[1] };
  const m = /^a(\d{1,3})$/.exec(v);
  return { yaw: m ? Number(m[1]) : 0, pitch: 0 };
}
/** Направление ракурса единичным вектором (x — к правому боку, y — вверх, z — к лицу). */
export function viewDir(v: string): [number, number, number] {
  const { yaw, pitch } = viewAngle(v), a = (yaw * Math.PI) / 180, b = (pitch * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)];
}
/** Ближайший по направлению ракурс из `among` к направлению `dir`. */
export function nearestView(among: readonly string[], dir: readonly [number, number, number]): string | null {
  let best: string | null = null, top = -2;
  for (const v of among) { const d = viewDir(v), k = d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2]; if (k > top + 1e-9) { top = k; best = v; } }
  return best;
}
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
  /**
   * Насколько сторона отстоит от середины детали наружу, в единицах стола: у кубика — половина ширины, у карты — 0
   * (лицо и спина — один лист). Нет — по тому, как деталь стоит к камере: коробка — половина ширины, прочие — 0.
   */
  out?: number;
}

export interface Detail {
  id: string;
  name: string;
  /** Набор, персонаж, что угодно — по ним ищут. */
  tags: string[];
  /** Ширина детали в единицах стола при величине ×1. */
  width: number;
  facing: Facing;
  /** Ракурсов по кругу — или нет, и тогда шесть сторон. */
  ring?: number;
  views: Partial<Record<DetailView, ViewSetup>>;
  at: number;
}

export const DETAIL_LIMITS = { dx: [-5, 5], dy: [-5, 5], scale: [0.2, 5], width: [0.2, 20], out: [-10, 10] } as const;
export const DETAIL_WIDTH = 2.4;
/** Имя, с которым деталь заводится кнопкой; пустая деталь с ним берёт имя заказа agy. */
export const NEW_DETAIL = "Новая деталь";
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
  const ring = Number.isInteger(r.ring) && (r.ring as number) >= RING_LIMITS[0] && (r.ring as number) <= RING_LIMITS[1] ? (r.ring as number) : undefined;
  const keys = viewsOf({ ring });
  const given = r.views && typeof r.views === "object" ? (r.views as Record<string, unknown>) : {};
  const drawn = new Set<DetailView>();
  for (const v of keys) {
    const one = given[v] as Record<string, unknown> | undefined;
    if (one && typeof one.sprite === "string" && SPRITE_REF.test(one.sprite)) drawn.add(v);
  }
  const views: Partial<Record<DetailView, ViewSetup>> = {};
  for (const v of keys) {
    const one = given[v] as Record<string, unknown> | undefined;
    if (!one || typeof one !== "object") continue;
    const place = { dx: num(one.dx, DETAIL_LIMITS.dx, 0), dy: num(one.dy, DETAIL_LIMITS.dy, 0), scale: num(one.scale, DETAIL_LIMITS.scale, 1), ...(typeof one.out === "number" && Number.isFinite(one.out) ? { out: num(one.out, DETAIL_LIMITS.out, 0) } : {}) };
    if (drawn.has(v)) views[v] = { sprite: one.sprite as string, ...place };
    else if (typeof one.mirror === "string" && one.mirror !== v && drawn.has(one.mirror as DetailView)) views[v] = { mirror: one.mirror as DetailView, ...place };
  }
  return { name, tags, width, facing, ...(ring ? { ring } : {}), views };
}

/**
 * СМЕНИТЬ НАБОР (шесть сторон ↔ N по кругу): каждая картинка переезжает на ближайший по углу ракурс нового набора,
 * со своими сдвигом и величиной; куда уже переехала другая — не встаёт (и не съезжает на соседний: 100° не станет спиной). Отражения и то, чему в новом наборе нет
 * места (верх и низ у круга), отпадают.
 */
export function moveViews(views: Detail["views"], to: { ring?: number }): Detail["views"] {
  const keys = viewsOf(to), out: Detail["views"] = {};
  const flat = (v: string) => Math.abs(viewDir(v)[1]) > 0.9;
  // Пары «картинка → её ближайший ракурс», самые близкие — первыми: ракурс берёт ту, что к нему ближе всех.
  const pairs = Object.entries(views).flatMap(([v, one]) => {
    if (!one?.sprite || (to.ring && flat(v))) return [];
    const at = nearestView(keys.filter((k) => !flat(k) || flat(v)), viewDir(v));
    if (!at) return [];
    const a = viewDir(v), b = viewDir(at);
    return [{ at, one, near: a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }];
  }).sort((x, y) => y.near - x.near);
  for (const { at, one } of pairs) if (!out[at]) out[at] = { ...one };
  return out;
}

/**
 * НАРИСОВАННОЕ — В ПУСТЫЕ РАКУРСЫ: сторона встаёт туда, где ракурса ещё нет (заданное хозяином не трогается);
 * левый бок, если пуст, — отражение бока. Стороны не из шести пропускаются.
 */
export function fillViews(views: Detail["views"], drawn: readonly (readonly [side: string, sprite: string])[], ring?: number): Detail["views"] {
  const out = { ...views };
  const keys = viewsOf({ ring });
  for (const [side, sprite] of drawn) {
    if (!(DETAIL_VIEWS as readonly string[]).includes(side)) continue;
    // По кругу — на ближайший угол; верх и низ у круга не встают.
    const at = ring ? (Math.abs(viewDir(side)[1]) > 0.9 ? null : nearestView(keys, viewDir(side))) : side;
    if (!at || out[at]) continue;
    out[at] = { sprite, dx: 0, dy: 0, scale: 1 };
  }
  if (!ring && !out.left && out.right?.sprite) out.left = { mirror: "right", dx: 0, dy: 0, scale: 1 };
  return out;
}

/** Насколько сторона отстоит от середины: своё — или по тому, как деталь стоит к камере. */
export const outOf = (d: Pick<Detail, "facing" | "width">, one: Pick<ViewSetup, "out">): number => one.out ?? (d.facing === "box" ? d.width / 2 : 0);
