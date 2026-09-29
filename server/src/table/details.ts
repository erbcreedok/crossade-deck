// ДЕТАЛИ — вещи, собранные хозяином из картинок библиотеки. Деталь — СПИСОК КАРТИНОК (слоёв) в своём пространстве:
//
//   оси       x — вправо (глядя на лицо детали), y — вверх, z — к лицу; единица — единица стола;
//   место     `x, y, z` — середина картинки;
//   поворот   `rx, ry, rz` в градусах, порядок YXZ (как в three.js): Y — разворот, X — наклон, Z — вокруг своей оси;
//             без поворота картинка смотрит лицом к лицу детали (+z);
//   величина  ширина картинки — ширина детали × `scale`; высота — по картинке, у фигурной формы — как ширина;
//   отражение `flipX` — слева направо, `flipY` — сверху вниз;
//   форма     `rect` — как картинка, `square`, `tri`, `pent`, `hex`, `circle` — вырезана правильной фигурой
//             (грани дайса);
//   когда     `always` — всегда; `nearest` — когда её лицо смотрит на тебя ближе всех (на одном угле — вместе:
//             лицо и веки поверх);
//   как стоит `plane` — как поставлена; `camera` — лицом к камере; `tilt` — лицом, но сужается по углу (бумажная);
//   порядок   место в списке: кто ниже — рисуется поверх (при равной глубине).
//
// ЗАГОТОВКИ ФОРМЫ (`shapeLayers`) — плоскость, куб, d4, d8, d12, d20, призма и ракурсы по кругу: ставят слои
// гранями; картинки прежних слоёв переезжают на ближайшие грани. У детали нет вида: шар — и голова, и ком снеговика.
//
// Картинка слоя — ссылка: своя картинка библиотеки (`table_sprites`, 12 знаков) или сторона встроенной детали
// каталога (`b:<деталь>:<ракурс>`, как в библиотеке на странице хозяина).

import type { Facing } from "./skins.js";

export type V3 = [number, number, number];
export const DETAIL_VIEWS = ["front", "right", "back", "left", "top", "bottom"] as const;
const SIDE_ANGLE: Record<string, [yaw: number, pitch: number]> = { front: [0, 0], right: [90, 0], back: [180, 0], left: [270, 0], top: [0, 90], bottom: [0, -90] };
/**
 * Ракурс каталога: сторона из шести или угол по кругу (`a40` — 40° от лица к правому боку детали). Правый бок —
 * правая рука того, кто смотрит на тебя: он слева от тебя, по −x.
 */
export function viewAngle(v: string): { yaw: number; pitch: number } {
  const side = SIDE_ANGLE[v];
  if (side) return { yaw: side[0], pitch: side[1] };
  const m = /^a(\d{1,3})$/.exec(v);
  return { yaw: m ? Number(m[1]) : 0, pitch: 0 };
}
/** Куда смотрит ракурс каталога — единичным вектором в осях детали. */
export function viewDir(v: string): V3 {
  const { yaw, pitch } = viewAngle(v);
  const a = (yaw * Math.PI) / 180, b = (pitch * Math.PI) / 180;
  return [-Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)];
}
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;

export type Show = "always" | "nearest";
export type Stand = "plane" | "camera" | "tilt";
export type Shape = "rect" | "square" | "tri" | "pent" | "hex" | "circle";
export const SHOWS: readonly Show[] = ["always", "nearest"];
export const STANDS: readonly Stand[] = ["plane", "camera", "tilt"];
export const SHAPES: readonly Shape[] = ["rect", "square", "tri", "pent", "hex", "circle"];
/** Углов у фигурной формы (круг — много). */
export const SHAPE_CORNERS: Record<Exclude<Shape, "rect" | "square">, number> = { tri: 3, pent: 5, hex: 6, circle: 48 };
/**
 * Углы фигурной формы в квадрате картинки: от −1 до 1, x — вправо, y — вверх; первый угол — наверху (туда смотрит
 * верх картинки). Прямоугольник и квадрат — `null`: картинка целиком.
 */
export function shapeCorners(shape: Shape): [number, number][] | null {
  if (shape === "rect" || shape === "square") return null;
  const n = SHAPE_CORNERS[shape];
  return Array.from({ length: n }, (_, k) => { const a = Math.PI / 2 + (2 * Math.PI * k) / n; return [Math.cos(a), Math.sin(a)]; });
}

export interface Layer {
  /** Своё имя слоя в детали — по нему слой выбран на странице и переживает перестановку. */
  id: string;
  /** Картинка — или пусто: место под картинку (заготовка формы, заказ agy заполнит). */
  sprite?: string;
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  /** Ширина картинки — во сколько раз от ширины детали. */
  scale: number;
  flipX: boolean;
  flipY: boolean;
  shape: Shape;
  show: Show;
  stand: Stand;
}

export interface Detail {
  id: string;
  name: string;
  /** Набор, персонаж, что угодно — по ним ищут. */
  tags: string[];
  /** Ширина детали в единицах стола при величине ×1. */
  width: number;
  /** Слои по порядку: кто ниже в списке — поверх. */
  layers: Layer[];
  at: number;
}

/** Как встроенная деталь стоит к камере — «когда» и «как стоит» её слоёв. */
export const FACING_LAYERS = {
  box: { show: "always", stand: "plane" },
  camera: { show: "nearest", stand: "camera" },
  tilt: { show: "nearest", stand: "tilt" },
  view: { show: "nearest", stand: "plane" },
} as const satisfies Record<Facing, { show: Show; stand: Stand }>;

export const DETAIL_LIMITS = { pos: [-20, 20], scale: [0.05, 10], width: [0.2, 20] } as const;
export const DETAIL_WIDTH = 2.4;
export const LAYERS_MAX = 64;
export const RING_LIMITS = [3, 36] as const;
/** Имя, с которым деталь заводится кнопкой; пустая деталь с ним берёт имя заказа agy. */
export const NEW_DETAIL = "Новая деталь";
const NAME_MAX = 40;
const SPRITE_REF = /^(?:[a-f0-9]{12}|b:[a-z0-9-]+:(?:head|hair|body|legs|hands):[a-z0-9]+)$/;

const round = (v: number, k = 1000) => Math.round(v * k) / k;
const num = (raw: unknown, [lo, hi]: readonly [number, number], or: number): number => {
  const v = typeof raw === "number" && Number.isFinite(raw) ? raw : or;
  return round(Math.min(hi, Math.max(lo, v)));
};
/** Угол — в −180…180. */
export const wrapDeg = (a: number): number => { const w = round((((a % 360) + 540) % 360) - 180); return w === -180 ? 180 : w; };
let idSeq = 0;
/** Новое имя слоя. */
export const layerId = (): string => `${Date.now().toString(36).slice(-4)}${(idSeq++ % 1296).toString(36).padStart(2, "0")}`;
/** Слой по умолчанию: лицом к лицу детали, в середине. */
export const layerOf = (o: Partial<Layer> = {}): Layer => ({ id: layerId(), x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, flipX: false, flipY: false, shape: "rect", show: "always", stand: "plane", ...o });

/** Слой из сети — только допустимое; числа в границах, углы в −180…180. */
function cleanLayer(raw: unknown, seen: Set<string>): Layer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  let id = typeof o.id === "string" && /^[a-z0-9]{1,8}$/.test(o.id) ? o.id : layerId();
  while (seen.has(id)) id = layerId();
  seen.add(id);
  const angle = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? wrapDeg(v) : 0);
  return {
    id,
    ...(typeof o.sprite === "string" && SPRITE_REF.test(o.sprite) ? { sprite: o.sprite } : {}),
    x: num(o.x, DETAIL_LIMITS.pos, 0),
    y: num(o.y, DETAIL_LIMITS.pos, 0),
    z: num(o.z, DETAIL_LIMITS.pos, 0),
    rx: angle(o.rx),
    ry: angle(o.ry),
    rz: angle(o.rz),
    scale: num(o.scale, DETAIL_LIMITS.scale, 1),
    flipX: o.flipX === true,
    flipY: o.flipY === true,
    shape: (SHAPES as readonly string[]).includes(o.shape as string) ? (o.shape as Shape) : "rect",
    show: (SHOWS as readonly string[]).includes(o.show as string) ? (o.show as Show) : "always",
    stand: (STANDS as readonly string[]).includes(o.stand as string) ? (o.stand as Stand) : "plane",
  };
}

/** ДЕТАЛЬ ИЗ СЕТИ — имя (без него — `null`), теги (до десяти коротких), ширина, слои (до `LAYERS_MAX`, по порядку). */
export function cleanDetail(raw: unknown): Omit<Detail, "id" | "at"> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, NAME_MAX) : "";
  if (!name) return null;
  const list = Array.isArray(r.tags) ? r.tags : typeof r.tags === "string" ? r.tags.split(",") : [];
  const tags = [...new Set(list.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, 24)).filter(Boolean))].slice(0, 10);
  const width = num(r.width, DETAIL_LIMITS.width, DETAIL_WIDTH);
  const seen = new Set<string>();
  const layers = (Array.isArray(r.layers) ? r.layers : []).slice(0, LAYERS_MAX).map((l) => cleanLayer(l, seen)).filter((l): l is Layer => l !== null);
  return { name, tags, width, layers };
}

// ——— повороты: матрица 3×3 по строкам ———
type M3 = number[][];
const mul = (a: M3, b: M3): M3 => a.map((row) => [0, 1, 2].map((j) => row[0]! * b[0]![j]! + row[1]! * b[1]![j]! + row[2]! * b[2]![j]!));
const Rx = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const Ry = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const Rz = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const apply = (m: M3, v: readonly number[]): V3 => [dot(m[0]!, v), dot(m[1]!, v), dot(m[2]!, v)];
/** Поворот слоя матрицей (YXZ, как в three.js). */
export const turnOf = (l: Pick<Layer, "rx" | "ry" | "rz">): M3 => mul(mul(Ry(rad(l.ry)), Rx(rad(l.rx))), Rz(rad(l.rz)));
/** Куда смотрит лицо слоя — единичным вектором в осях детали. */
export const normalOf = (l: Pick<Layer, "rx" | "ry" | "rz">): V3 => apply(turnOf(l), [0, 0, 1]);
/** Где у слоя верх картинки — единичным вектором в осях детали. */
export const upOf = (l: Pick<Layer, "rx" | "ry" | "rz">): V3 => apply(turnOf(l), [0, 1, 0]);
/** Углы YXZ из матрицы поворота (как `Euler.setFromRotationMatrix` в three.js). */
export function anglesOf(m: M3): { rx: number; ry: number; rz: number } {
  const m23 = Math.max(-1, Math.min(1, m[1]![2]!));
  const rx = Math.asin(-m23);
  if (Math.abs(m23) < 0.9999999) return { rx: wrapDeg(deg(rx)), ry: wrapDeg(deg(Math.atan2(m[0]![2]!, m[2]![2]!))), rz: wrapDeg(deg(Math.atan2(m[1]![0]!, m[1]![1]!))) };
  return { rx: wrapDeg(deg(rx)), ry: wrapDeg(deg(Math.atan2(-m[2]![0]!, m[0]![0]!))), rz: 0 };
}
/** Поворот, у которого лицо смотрит по `normal`, а верх картинки — по `up` (перпендикулярно лицу). */
export function facing(normal: V3, up: V3): { rx: number; ry: number; rz: number } {
  const n = unit(normal), u = unit(sub(up, scaled(n, dot(up, n))));
  const x = cross(u, n);
  return anglesOf([[x[0], u[0], n[0]], [x[1], u[1], n[1]], [x[2], u[2], n[2]]]);
}
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const scaled = (a: readonly number[], k: number): V3 => [a[0]! * k, a[1]! * k, a[2]! * k];
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const unit = (a: readonly number[]): V3 => { const n = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return [a[0]! / n, a[1]! / n, a[2]! / n]; };
/** Насколько слой от середины детали. */
export const distOf = (l: Pick<Layer, "x" | "y" | "z">): number => Math.hypot(l.x, l.y, l.z);
/**
 * Отодвинуть слой от середины на `d`: по тому же направлению, а стоит в середине — по своему лицу.
 */
export function atDist(l: Layer, d: number): Pick<Layer, "x" | "y" | "z"> {
  const len = distOf(l), dir = len > 1e-6 ? scaled([l.x, l.y, l.z], 1 / len) : normalOf(l);
  return { x: round(dir[0] * d), y: round(dir[1] * d), z: round(dir[2] * d) };
}

/**
 * ПРЕЖНИЙ СЛОЙ → нынешний: угол (`yaw` от лица к правому боку, `pitch` — вверх) — поворот, «вправо / вверх / наружу»
 * по картинке — место в осях детали, отражение — слева направо.
 */
export function layerFromOld(o: { id?: string; sprite?: string; flip?: boolean; yaw: number; pitch: number; dx?: number; dy?: number; scale?: number; out?: number; show: Show; stand: Stand }, width: number): Layer {
  const turn = { rx: wrapDeg(-o.pitch), ry: wrapDeg(-o.yaw), rz: 0 };
  const out = o.out ?? (o.show === "always" && o.stand === "plane" ? width / 2 : 0);
  const at = apply(turnOf(turn), [o.dx ?? 0, o.dy ?? 0, out]);
  return { id: o.id ?? layerId(), ...(o.sprite ? { sprite: o.sprite } : {}), x: round(at[0]), y: round(at[1]), z: round(at[2]), ...turn, scale: o.scale ?? 1, flipX: !!o.flip, flipY: false, shape: "rect", show: o.show, stand: o.stand };
}
/** Слои, сохранённые до пространства (с углом `yaw`), — в нынешние; нынешние — как есть. */
export function upgradeLayers(raw: unknown[], width: number): unknown[] {
  return raw.map((l) => (l && typeof l === "object" && "yaw" in l ? layerFromOld(l as Parameters<typeof layerFromOld>[0], width) : l));
}

/**
 * РАКУРСЫ КАТАЛОГА → СЛОИ: встроенные детали и детали, сохранённые до слоёв. Нарисованный ракурс — слой на своём угле;
 * отражённый — та же картинка, отражённая, на угле отражения; «когда» и «как стоит» — по тому, как деталь стоит к камере.
 */
export function layersFromViews(views: Record<string, { sprite?: string; mirror?: string; dx?: number; dy?: number; scale?: number; out?: number } | undefined>, facingOf: Facing, width = DETAIL_WIDTH): Layer[] {
  const p = FACING_LAYERS[facingOf];
  const out: Layer[] = [];
  let k = 0;
  for (const [v, one] of Object.entries(views)) {
    const sprite = one?.sprite ?? (one?.mirror ? views[one.mirror]?.sprite : undefined);
    if (!one || !sprite) continue;
    const { yaw, pitch } = viewAngle(v);
    out.push(layerFromOld({ id: `v${(k++).toString(36)}`, sprite, flip: !one.sprite, yaw, pitch, dx: one.dx ?? 0, dy: one.dy ?? 0, scale: one.scale ?? 1, ...(typeof one.out === "number" ? { out: one.out } : {}), show: p.show, stand: p.stand }, width));
  }
  return out;
}

/**
 * ЧТО ВИДНО, если смотреть с `me` (направление в осях детали): все «всегда» и те «по углу», чьё лицо смотрит на тебя
 * ближе всех (все на этом угле — вместе). По порядку списка. `empty` — и места без картинки (на странице хозяина).
 */
export function visibleLayers(layers: readonly Layer[], me: readonly [number, number, number], empty = false): Layer[] {
  const has = (l: Layer) => empty || !!l.sprite;
  let best = -2;
  for (const l of layers) if (l.show === "nearest" && has(l)) best = Math.max(best, dot(normalOf(l), me));
  return layers.filter((l) => has(l) && (l.show === "always" || dot(normalOf(l), me) > best - 1e-6));
}

// ——— заготовки формы ———
export type ShapeKind = "plane" | "cube" | "d4" | "d8" | "d12" | "d20" | "prism" | "views";
/** Грань заготовки: где середина, куда лицо, куда верх картинки, величина и форма. */
interface Face { at: V3; normal: V3; up: V3; scale: number; shape: Shape }
const PHI = (1 + Math.sqrt(5)) / 2;
/** Грани многогранника по вершинам и граням (номера вершин по кругу): верх картинки — к первой вершине. */
function solid(verts: V3[], faces: number[][], radius: number, width: number, shape: Shape): Face[] {
  const k = radius / Math.hypot(...verts[0]!);
  const v = verts.map((p) => scaled(p, k));
  return faces.map((f) => {
    const c = scaled(f.map((i) => v[i]!).reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as V3, [0, 0, 0] as V3), 1 / f.length);
    const corner = Math.hypot(...sub(v[f[0]!]!, c));
    return { at: c, normal: unit(c), up: unit(sub(v[f[0]!]!, c)), scale: (2 * corner) / width, shape };
  });
}
/** Грани по выпуклой оболочке: все тройки вершин на одной плоскости, где остальные по одну сторону. */
function hull(verts: V3[], perFace: number): number[][] {
  const out: number[][] = [];
  const seen = new Set<string>();
  for (let a = 0; a < verts.length; a++) for (let b = a + 1; b < verts.length; b++) for (let c = b + 1; c < verts.length; c++) {
    let n = cross(sub(verts[b]!, verts[a]!), sub(verts[c]!, verts[a]!));
    if (Math.hypot(...n) < 1e-9) continue;
    n = unit(n);
    const d = dot(n, verts[a]!);
    const side = verts.map((p) => dot(n, p) - d);
    if (side.some((s) => s > 1e-6) && side.some((s) => s < -1e-6)) continue;
    if (side.every((s) => s <= 1e-6)) { /* наружу */ } else n = scaled(n, -1);
    const on = verts.map((_, i) => i).filter((i) => Math.abs(side[i]!) < 1e-6);
    if (on.length !== perFace) continue;
    const key = on.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    // По кругу вокруг середины грани, против часовой, если смотреть снаружи.
    const mid = scaled(on.map((i) => verts[i]!).reduce((p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]] as V3, [0, 0, 0] as V3), 1 / on.length);
    const e1 = unit(sub(verts[on[0]!]!, mid)), e2 = cross(n, e1);
    const around = (i: number) => Math.atan2(dot(sub(verts[i]!, mid), e2), dot(sub(verts[i]!, mid), e1));
    on.sort((i, j) => around(i) - around(j));
    // Верх картинки — к вершине выше всех (одинаково у соседних граней, дайс читается ровно).
    const top = on.reduce((best, i) => (verts[i]![1] > verts[best]![1] + 1e-9 ? i : best), on[0]!);
    while (on[0] !== top) on.push(on.shift()!);
    out.push(on);
  }
  return out;
}
const SOLIDS: Record<"d4" | "d8" | "d12" | "d20", () => { verts: V3[]; per: number; shape: Shape }> = {
  d4: () => ({ verts: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]], per: 3, shape: "tri" }),
  d8: () => ({ verts: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], per: 3, shape: "tri" }),
  d12: () => {
    const verts: V3[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) verts.push([x, y, z]);
    for (const a of [-1, 1]) for (const b of [-1, 1]) verts.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [b * PHI, 0, a / PHI]);
    return { verts, per: 5, shape: "pent" };
  },
  d20: () => {
    const verts: V3[] = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) verts.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
    return { verts, per: 3, shape: "tri" };
  },
};

/** Грани заготовки для детали шириной `width`; `n` — сколько граней у призмы и ракурсов. */
export function shapeFaces(kind: ShapeKind, width: number, n = 16): { faces: Face[]; show: Show; stand: Stand } {
  const always = { show: "always" as Show, stand: "plane" as Stand };
  if (kind === "plane") return { faces: [{ at: [0, 0, 0], normal: [0, 0, 1], up: [0, 1, 0], scale: 1, shape: "rect" }], ...always };
  if (kind === "cube") {
    const h = width / 2;
    const sides: [V3, V3][] = [[[0, 0, 1], [0, 1, 0]], [[-1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0]], [[1, 0, 0], [0, 1, 0]], [[0, 1, 0], [0, 0, -1]], [[0, -1, 0], [0, 0, 1]]];
    return { faces: sides.map(([normal, up]) => ({ at: scaled(normal, h), normal, up, scale: 1, shape: "square" })), ...always };
  }
  if (kind === "prism" || kind === "views") {
    const m = Math.min(RING_LIMITS[1], Math.max(RING_LIMITS[0], Math.round(n)));
    const faces = Array.from({ length: m }, (_, k): Face => {
      const a = (2 * Math.PI * k) / m, normal: V3 = [-Math.sin(a), 0, Math.cos(a)];
      return kind === "prism"
        ? { at: scaled(normal, width / 2), normal, up: [0, 1, 0], scale: Math.tan(Math.PI / m), shape: "rect" }
        : { at: [0, 0, 0], normal, up: [0, 1, 0], scale: 1, shape: "rect" };
    });
    return { faces, ...(kind === "prism" ? always : { show: "nearest", stand: "camera" }) };
  }
  const s = SOLIDS[kind]();
  return { faces: solid(s.verts, hull(s.verts, s.per), (width * 0.75), width, s.shape), ...always };
}

/**
 * ПОСТАВИТЬ ЗАГОТОВКУ: слои — грани заготовки; картинка прежнего слоя переезжает на ближайшую по лицу грань (пары —
 * от самых близких, не дальше 60°), с отражением; остальное прежнее уходит (на странице — «Отменить»).
 */
export function shapeLayers(kind: ShapeKind, old: readonly Layer[], width: number, n = 16): { layers: Layer[]; moved: number; dropped: number } {
  const { faces, show, stand } = shapeFaces(kind, width, n);
  const layers = faces.map((f) => layerOf({ x: round(f.at[0]), y: round(f.at[1]), z: round(f.at[2]), ...facing(f.normal, f.up), scale: round(f.scale), shape: f.shape, show, stand }));
  const drawn = old.filter((l) => l.sprite);
  const pairs = drawn.flatMap((l, i) => faces.map((f, j) => ({ i, j, near: dot(normalOf(l), f.normal) }))).sort((a, b) => b.near - a.near);
  const usedL = new Set<number>(), usedF = new Set<number>();
  for (const { i, j, near } of pairs) {
    if (near < 0.5 || usedL.has(i) || usedF.has(j)) continue;
    usedL.add(i); usedF.add(j);
    Object.assign(layers[j]!, { sprite: drawn[i]!.sprite, flipX: drawn[i]!.flipX, flipY: drawn[i]!.flipY });
  }
  return { layers, moved: usedL.size, dropped: drawn.length - usedL.size };
}

/**
 * НАРИСОВАННОЕ AGY — В ДЕТАЛЬ: сторона встаёт в пустой слой, что смотрит туда же, а нет его — новым слоем, если в ту
 * сторону ещё не смотрит картинка (заданное хозяином не трогается); левый бок, если его нет, — отражение правого.
 */
export function fillLayers(layers: readonly Layer[], drawn: readonly (readonly [side: string, sprite: string])[], width = DETAIL_WIDTH): Layer[] {
  const out = layers.map((l) => ({ ...l }));
  const like = out.find((l) => l.sprite) ?? out[0] ?? { show: "always" as Show, stand: "plane" as Stand };
  const on = (dir: V3) => (l: Layer) => dot(normalOf(l), dir) > 0.999;
  const place = (side: string, sprite: string, flip = false): Layer => {
    const { yaw, pitch } = viewAngle(side);
    return layerFromOld({ yaw, pitch, show: like.show, stand: like.stand, sprite, flip }, width);
  };
  for (const [side, sprite] of drawn) {
    if (!(DETAIL_VIEWS as readonly string[]).includes(side)) continue;
    const dir = viewDir(side);
    if (out.some((l) => on(dir)(l) && l.sprite)) continue;
    const empty = out.find((l) => on(dir)(l) && !l.sprite);
    if (empty) empty.sprite = sprite;
    else out.push(place(side, sprite));
  }
  const rightDir = viewDir("right"), leftDir = viewDir("left");
  const right = out.find((l) => on(rightDir)(l) && l.sprite && !l.flipX);
  if (right && !out.some((l) => on(leftDir)(l) && l.sprite)) {
    const empty = out.find((l) => on(leftDir)(l) && !l.sprite);
    if (empty) Object.assign(empty, { sprite: right.sprite, flipX: true });
    else out.push(place("left", right.sprite!, true));
  }
  return out;
}
