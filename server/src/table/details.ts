// ДЕТАЛИ — вещи, собранные хозяином из картинок библиотеки. Деталь — СПИСОК КАРТИНОК (слоёв), у каждой:
//
//   угол      откуда она видна: поворот вокруг вертикали от лица к правому боку (`yaw`, 0…360) и наклон (`pitch`,
//             верх — 90, низ — −90);
//   место     вправо и вверх — по самой картинке, наружу — от середины детали по её углу; величина — от ширины детали;
//   когда     `always` — всегда; `nearest` — когда её угол ближе всех к тебе (картинки на одном угле показываются
//             вместе: лицо и веки поверх);
//   как стоит `plane` — в своей плоскости, на своём месте; `camera` — лицом к камере; `tilt` — лицом, но сужается
//             по углу (бумажная);
//   порядок   место в списке: кто ниже — рисуется поверх (при равной глубине).
//
// Четыре заготовки показа (`PRESETS`) проставляют «когда» и «как стоит» всем слоям сразу: коробка, всегда лицом,
// бумажный, плоскость; после них любой слой правится руками — так собирается свой способ. Заготовки углов — шесть
// сторон и N по кругу (`placeAngles`). У детали нет вида: шар — и голова, и ком снеговика; кем встанет — решает фигура.
//
// Картинка слоя — ссылка: своя картинка библиотеки (`table_sprites`, 12 знаков) или сторона встроенной детали
// каталога (`b:<деталь>:<ракурс>`, как в библиотеке на странице хозяина).

import type { Facing } from "./skins.js";

export const DETAIL_VIEWS = ["front", "right", "back", "left", "top", "bottom"] as const;
/** Ракурс каталога: сторона из шести или угол по кругу (`a40` — 40° от лица к правому боку). */
export type DetailView = string;
export const RING_LIMITS = [3, 36] as const;
/** Ракурсы по кругу: `n` штук через равный угол, от лица. */
export const ringViews = (n: number): string[] => Array.from({ length: n }, (_, k) => `a${Math.round((k * 360) / n)}`);
const SIDE_ANGLE: Record<string, [yaw: number, pitch: number]> = { front: [0, 0], right: [90, 0], back: [180, 0], left: [270, 0], top: [0, 90], bottom: [0, -90] };
/** Куда смотрит ракурс каталога: угол вокруг вертикали от лица к правому боку и наклон (верх — 90). */
export function viewAngle(v: string): { yaw: number; pitch: number } {
  const side = SIDE_ANGLE[v];
  if (side) return { yaw: side[0], pitch: side[1] };
  const m = /^a(\d{1,3})$/.exec(v);
  return { yaw: m ? Number(m[1]) : 0, pitch: 0 };
}
/** Направление угла единичным вектором (x — к правому боку, y — вверх, z — к лицу). */
export function dirOf(yaw: number, pitch: number): [number, number, number] {
  const a = (yaw * Math.PI) / 180, b = (pitch * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)];
}
export const viewDir = (v: string): [number, number, number] => { const { yaw, pitch } = viewAngle(v); return dirOf(yaw, pitch); };
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

export type Show = "always" | "nearest";
export type Stand = "plane" | "camera" | "tilt";
export const SHOWS: readonly Show[] = ["always", "nearest"];
export const STANDS: readonly Stand[] = ["plane", "camera", "tilt"];

export interface Layer {
  /** Своё имя слоя в детали — по нему слой выбран на странице и переживает перестановку. */
  id: string;
  /** Картинка — или пусто: место под картинку (заготовка углов, заказ agy заполнит). */
  sprite?: string;
  /** Отражена слева направо: левый бок — это правый наоборот. */
  flip: boolean;
  yaw: number;
  pitch: number;
  /** Вправо и вверх по картинке, в единицах стола. */
  dx: number;
  dy: number;
  /** Во сколько раз больше обычной ширины детали. */
  scale: number;
  /** Насколько от середины детали наружу по своему углу, в единицах стола; нет — по умолчанию (`outOf`). */
  out?: number;
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

/** ЗАГОТОВКИ ПОКАЗА — «когда» и «как стоит» всем слоям сразу. */
export const PRESETS = {
  box: { show: "always", stand: "plane" },
  camera: { show: "nearest", stand: "camera" },
  tilt: { show: "nearest", stand: "tilt" },
  view: { show: "nearest", stand: "plane" },
} as const satisfies Record<Facing, { show: Show; stand: Stand }>;
export type Preset = keyof typeof PRESETS;
/** Какая заготовка у слоёв — или `null`: у слоёв своё, смесь. */
export function presetOf(layers: readonly Layer[]): Preset | null {
  if (!layers.length) return null;
  for (const [k, p] of Object.entries(PRESETS) as [Preset, (typeof PRESETS)[Preset]][]) if (layers.every((l) => l.show === p.show && l.stand === p.stand)) return k;
  return null;
}

export const DETAIL_LIMITS = { dx: [-5, 5], dy: [-5, 5], scale: [0.2, 5], width: [0.2, 20], out: [-10, 10], pitch: [-90, 90] } as const;
export const DETAIL_WIDTH = 2.4;
export const LAYERS_MAX = 64;
/** Имя, с которым деталь заводится кнопкой; пустая деталь с ним берёт имя заказа agy. */
export const NEW_DETAIL = "Новая деталь";
const NAME_MAX = 40;
const SPRITE_REF = /^(?:[a-f0-9]{12}|b:[a-z0-9-]+:(?:head|hair|body|legs|hands):[a-z0-9]+)$/;

const num = (raw: unknown, [lo, hi]: readonly [number, number], or: number): number => {
  const v = typeof raw === "number" && Number.isFinite(raw) ? raw : or;
  return Math.round(Math.min(hi, Math.max(lo, v)) * 1000) / 1000;
};
/** Поворот — в 0…360. */
export const wrapYaw = (yaw: number): number => Math.round((((yaw % 360) + 360) % 360) * 1000) / 1000;
let idSeq = 0;
/** Новое имя слоя. */
export const layerId = (): string => `${Date.now().toString(36).slice(-4)}${(idSeq++ % 1296).toString(36).padStart(2, "0")}`;

/** Слой из сети — только допустимое; числа в границах. */
function cleanLayer(raw: unknown, seen: Set<string>): Layer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  let id = typeof o.id === "string" && /^[a-z0-9]{1,8}$/.test(o.id) ? o.id : layerId();
  while (seen.has(id)) id = layerId();
  seen.add(id);
  const yaw = typeof o.yaw === "number" && Number.isFinite(o.yaw) ? wrapYaw(o.yaw) : 0;
  return {
    id,
    ...(typeof o.sprite === "string" && SPRITE_REF.test(o.sprite) ? { sprite: o.sprite } : {}),
    flip: o.flip === true,
    yaw,
    pitch: num(o.pitch, DETAIL_LIMITS.pitch, 0),
    dx: num(o.dx, DETAIL_LIMITS.dx, 0),
    dy: num(o.dy, DETAIL_LIMITS.dy, 0),
    scale: num(o.scale, DETAIL_LIMITS.scale, 1),
    ...(typeof o.out === "number" && Number.isFinite(o.out) ? { out: num(o.out, DETAIL_LIMITS.out, 0) } : {}),
    show: (SHOWS as readonly string[]).includes(o.show as string) ? (o.show as Show) : "nearest",
    stand: (STANDS as readonly string[]).includes(o.stand as string) ? (o.stand as Stand) : "tilt",
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

/**
 * РАКУРСЫ КАТАЛОГА → СЛОИ: встроенные детали и детали, сохранённые до слоёв. Нарисованный ракурс — слой на своём угле;
 * отражённый — та же картинка, отражённая, на угле отражения; «когда» и «как стоит» — по тому, как деталь стоит к камере.
 */
export function layersFromViews(views: Record<string, { sprite?: string; mirror?: string; dx?: number; dy?: number; scale?: number; out?: number } | undefined>, facing: Facing): Layer[] {
  const p = PRESETS[facing];
  const out: Layer[] = [];
  let k = 0;
  for (const [v, one] of Object.entries(views)) {
    const sprite = one?.sprite ?? (one?.mirror ? views[one.mirror]?.sprite : undefined);
    if (!one || !sprite) continue;
    const { yaw, pitch } = viewAngle(v);
    out.push({ id: `v${(k++).toString(36)}`, sprite, flip: !one.sprite, yaw, pitch, dx: one.dx ?? 0, dy: one.dy ?? 0, scale: one.scale ?? 1, ...(typeof one.out === "number" ? { out: one.out } : {}), show: p.show, stand: p.stand });
  }
  return out;
}

/** Насколько слой от середины наружу: своё — или у коробки (всегда, в своей плоскости) полширины, у прочих 0. */
export const outOf = (width: number, l: Pick<Layer, "out" | "show" | "stand">): number => l.out ?? (l.show === "always" && l.stand === "plane" ? width / 2 : 0);

/**
 * ЧТО ВИДНО, если смотреть с `me` (направление в осях детали): все «всегда» и те «по углу», чей угол ближе всех к
 * тебе (все на этом угле — вместе). По порядку списка.
 */
export function visibleLayers(layers: readonly Layer[], me: readonly [number, number, number]): Layer[] {
  let best = -2;
  for (const l of layers) if (l.show === "nearest" && l.sprite) best = Math.max(best, dot(dirOf(l.yaw, l.pitch), me));
  return layers.filter((l) => l.sprite && (l.show === "always" || dot(dirOf(l.yaw, l.pitch), me) > best - 1e-6));
}

/** Заготовки углов: шесть сторон и N по кругу. */
export const sideAngles = (): [number, number][] => DETAIL_VIEWS.map((v) => { const a = viewAngle(v); return [a.yaw, a.pitch]; });
export const ringAngles = (n: number): [number, number][] => ringViews(n).map((v) => [viewAngle(v).yaw, 0]);

/**
 * РАССТАВИТЬ УГЛЫ по заготовке: угол берёт самый близкий к себе слой (пары — от самых близких, не дальше 60°: верх
 * не заберёт слой, что смотрит вбок), слой встаёт ровно на угол; слои, которым угла не хватило, остаются, где были; углы без слоя — новые пустые слои (места под картинку).
 * «Когда» и «как стоит» новых — как у первого слоя.
 */
export function placeAngles(layers: readonly Layer[], angles: readonly [number, number][]): Layer[] {
  const out = layers.map((l) => ({ ...l }));
  const pairs = out.flatMap((l, i) => angles.map(([yaw, pitch], j) => ({ i, j, near: dot(dirOf(l.yaw, l.pitch), dirOf(yaw, pitch)) }))).sort((a, b) => b.near - a.near);
  const usedL = new Set<number>(), usedA = new Set<number>();
  for (const { i, j, near } of pairs) {
    if (near < 0.5 || usedL.has(i) || usedA.has(j)) continue;
    usedL.add(i); usedA.add(j);
    out[i]!.yaw = angles[j]![0]; out[i]!.pitch = angles[j]![1];
  }
  const like = out[0] ?? { show: "nearest" as Show, stand: "tilt" as Stand };
  angles.forEach(([yaw, pitch], j) => { if (!usedA.has(j)) out.push({ id: layerId(), flip: false, yaw, pitch, dx: 0, dy: 0, scale: 1, show: like.show, stand: like.stand }); });
  return out;
}

/**
 * НАРИСОВАННОЕ AGY — В ДЕТАЛЬ: сторона встаёт в пустой слой на своём угле, а нет его — новым слоем, если на этом
 * угле ещё нет картинки (заданное хозяином не трогается); левый бок, если его нет, — отражение бока.
 */
export function fillLayers(layers: readonly Layer[], drawn: readonly (readonly [side: string, sprite: string])[]): Layer[] {
  const out = layers.map((l) => ({ ...l }));
  const like = out.find((l) => l.sprite) ?? out[0] ?? { show: "nearest" as Show, stand: "tilt" as Stand };
  const on = (yaw: number, pitch: number) => (l: Layer) => dot(dirOf(l.yaw, l.pitch), dirOf(yaw, pitch)) > 0.999;
  for (const [side, sprite] of drawn) {
    if (!(DETAIL_VIEWS as readonly string[]).includes(side)) continue;
    const { yaw, pitch } = viewAngle(side);
    if (out.some((l) => on(yaw, pitch)(l) && l.sprite)) continue;
    const empty = out.find((l) => on(yaw, pitch)(l) && !l.sprite);
    if (empty) empty.sprite = sprite;
    else out.push({ id: layerId(), sprite, flip: false, yaw, pitch, dx: 0, dy: 0, scale: 1, show: like.show, stand: like.stand });
  }
  const right = out.find((l) => on(90, 0)(l) && l.sprite && !l.flip);
  if (right && !out.some((l) => on(270, 0)(l) && l.sprite)) {
    const empty = out.find((l) => on(270, 0)(l) && !l.sprite);
    if (empty) Object.assign(empty, { sprite: right.sprite, flip: true });
    else out.push({ ...right, id: layerId(), flip: true, yaw: 270 });
  }
  return out;
}
