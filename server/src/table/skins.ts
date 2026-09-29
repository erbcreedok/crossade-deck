// СКИНЫ — кем человек сидит за столом. Скин — НАБОР ЧАСТЕЙ: голова, причёска, тело, руки, ноги (конструктор,
// стенд `design/skinmaker`). У каждой части свои ракурсы, как у спрайтов в старых 3D-играх (Doom): каждый кадр
// показывается тот, что ближе к глазу, — в СВОИХ осях части (тело смотрит, куда стул, голова — куда человек).
// И у каждой части свой режим, как она стоит к камере (`Facing`).
//
// Готовые наборы (`SETS`) заполняют все части разом; их id — прежние id кукол (`king`, `dog`…), и старый профиль,
// где записана одна кукла, читается как её набор.
//
// Одно место на сервер, веб и Unity: чистые данные и чистый выбор ракурса.

/** Направление в осях части: x — её правая рука, y — куда она смотрит, z — вверх. */
export type Dir = readonly [number, number, number];

/** N ракурсов по кругу (вид сбоку через каждые 360/N°): «a0» — спереди, дальше по часовой, если смотреть сверху. */
const ring = (n: number): Record<string, Dir> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [`a${Math.round((i / n) * 360)}`, [Math.sin(a), Math.cos(a), 0] as const]; }));

export const VIEW_DIRS: Record<string, Dir> = {
  front: [0, 1, 0],
  back: [0, -1, 0],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  ...ring(18),
};

export const SLOTS = ["head", "hair", "body", "hands", "legs"] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_NAMES: Record<Slot, string> = { head: "Голова", hair: "Причёска", body: "Тело", hands: "Руки", legs: "Ноги" };

/**
 * КАК ЧАСТЬ СТОИТ К КАМЕРЕ:
 *   camera — всегда лицом в камеру, по углу меняется только рисунок (классический Doom): бочонок, шар;
 *   box    — настоящая коробка, видно до трёх граней сразу: кубик;
 *   view   — плоскость ровно по своему ракурсу, сверху — плашмя: крестоносец;
 *   tilt   — бумажный спрайт: лицом в камеру, а по ширине сужается по углу к ракурсу: карты, звери, ноги.
 */
export type Facing = "camera" | "box" | "view" | "tilt";

/** Откуда рисунок части — у каждого источника свой пекарь на клиенте (`dollSprites.ts`). */
export type PartArt =
  | { kind: "court"; card: string }
  | { kind: "file"; dir: string }
  | { kind: "draw"; art: string }
  | { kind: "png"; file: string }
  | { kind: "none" };

export interface Part {
  id: string;
  slot: Slot;
  name: string;
  art: PartArt;
  /** Нарисованные ракурсы. */
  views: readonly string[];
  /** Ракурсы, которые берутся отражением нарисованного: `left` — это `right` наоборот. */
  mirror?: Readonly<Record<string, string>>;
  facing: Facing;
  /** Перекрашивается ли расцветкой (три краски колоды). */
  recolor: boolean;
}

export type Parts = Record<Slot, string>;
export interface SkinSet {
  id: string;
  name: string;
  parts: Parts;
}

const COURTS = [
  ["king", "club-K", "Король треф"], ["queen", "diamond-Q", "Дама бубен"],
  ["club-J", "club-J", "Валет треф"], ["club-Q", "club-Q", "Дама треф"],
  ["diamond-J", "diamond-J", "Валет бубен"], ["diamond-K", "diamond-K", "Король бубен"],
  ["heart-J", "heart-J", "Валет червей"], ["heart-Q", "heart-Q", "Дама червей"], ["heart-K", "heart-K", "Король червей"],
  ["spade-J", "spade-J", "Валет пик"], ["spade-Q", "spade-Q", "Дама пик"], ["spade-K", "spade-K", "Король пик"],
] as const;
const BEASTS = [["dog", "Пёс", ["front", "back", "right"]], ["cat", "Кошка", ["front", "back", "right"]], ["crusader", "Крестоносец", ["front", "back", "right", "top", "bottom"]]] as const;
const SIDE_MIRROR = { left: "right" } as const;
/** Боты: общее тело крупье и голова по характеру (`bots/profiles.ts`); стороны — как у крестоносца. */
const BOT_HEADS = [["bot-hoarder", "Копитель"], ["bot-closer", "Закрывала"], ["bot-aggressor", "Агрессор"], ["bot-rookie", "Новичок"]] as const;
const SIX = ["front", "back", "right", "top", "bottom"] as const;

export const PARTS: readonly Part[] = [
  ...COURTS.flatMap(([id, card, name]) => (["head", "body"] as const).map((slot): Part => ({ id: `${id}:${slot}`, slot, name, art: { kind: "court", card }, views: ["front", "back"], facing: "tilt", recolor: true }))),
  ...BEASTS.flatMap(([id, name, views]) => (["head", "body"] as const).map((slot): Part => ({ id: `${id}:${slot}`, slot, name, art: { kind: "file", dir: id }, views, mirror: SIDE_MIRROR, facing: id === "crusader" ? "view" : "tilt", recolor: true }))),
  { id: "bot:body", slot: "body", name: "Робот", art: { kind: "file", dir: "bot" }, views: [...SIX], mirror: SIDE_MIRROR, facing: "view", recolor: true },
  ...BOT_HEADS.map(([id, name]): Part => ({ id: `${id}:head`, slot: "head", name, art: { kind: "file", dir: id }, views: [...SIX], mirror: SIDE_MIRROR, facing: "view", recolor: true })),
  { id: "ball:head", slot: "head", name: "Шар", art: { kind: "draw", art: "ball" }, views: ["front"], facing: "camera", recolor: true },
  // Голова-аватар: тот же шар, но в нём — фото человека из Telegram (рисует его стол, фото у каждого своё).
  { id: "avatar:head", slot: "head", name: "Аватар", art: { kind: "draw", art: "ball" }, views: ["front"], facing: "camera", recolor: true },
  { id: "cube:head", slot: "head", name: "Кубик", art: { kind: "draw", art: "cube" }, views: ["front", "back", "right", "left", "top", "bottom"], facing: "box", recolor: true },
  { id: "stick:body", slot: "body", name: "Палка", art: { kind: "draw", art: "stick" }, views: ["front"], facing: "camera", recolor: true },
  { id: "barrel:body", slot: "body", name: "Бочонок", art: { kind: "draw", art: "barrel" }, views: Object.keys(ring(18)), facing: "camera", recolor: true },
  { id: "none:hair", slot: "hair", name: "Без", art: { kind: "none" }, views: ["front"], facing: "camera", recolor: false },
  { id: "crown:hair", slot: "hair", name: "Корона", art: { kind: "draw", art: "crown" }, views: ["front", "back", "right"], mirror: SIDE_MIRROR, facing: "tilt", recolor: true },
  { id: "cap:hair", slot: "hair", name: "Колпак", art: { kind: "draw", art: "cap" }, views: ["front"], facing: "camera", recolor: true },
  { id: "hand:hands", slot: "hands", name: "Руки", art: { kind: "png", file: "hand-open" }, views: ["front"], facing: "camera", recolor: false },
  { id: "stick:legs", slot: "legs", name: "Две линии", art: { kind: "draw", art: "stick-legs" }, views: ["front"], facing: "camera", recolor: true },
  { id: "legs-card:legs", slot: "legs", name: "Двор", art: { kind: "file", dir: "legs-card" }, views: ["front", "back", "right"], mirror: SIDE_MIRROR, facing: "tilt", recolor: true },
  { id: "legs-beast:legs", slot: "legs", name: "Лапы", art: { kind: "file", dir: "legs-beast" }, views: ["front", "back", "right"], mirror: SIDE_MIRROR, facing: "tilt", recolor: true },
];

const set = (id: string, name: string, head: string, body: string, legs: string, hair = "none:hair"): SkinSet => ({ id, name, parts: { head, hair, body, hands: "hand:hands", legs } });
export const SETS: readonly SkinSet[] = [
  ...COURTS.map(([id, , name]) => set(id, name, `${id}:head`, `${id}:body`, "legs-card:legs")),
  set("dog", "Пёс", "dog:head", "dog:body", "legs-beast:legs"),
  set("cat", "Кошка", "cat:head", "cat:body", "legs-beast:legs"),
  set("crusader", "Крестоносец", "crusader:head", "crusader:body", "legs-card:legs"),
  set("cube", "Кубик", "cube:head", "barrel:body", "stick:legs"),
  ...BOT_HEADS.map(([id, name]) => set(id, name, `${id}:head`, "bot:body", "legs-card:legs")),
  set("stick", "Палка", "ball:head", "stick:body", "stick:legs"),
  set("mix", "Шар и бочонок", "ball:head", "barrel:body", "stick:legs", "cap:hair"),
];

/** Голова-аватар: кружок с фото человека из Telegram (выдаётся наградой, `rewards.ts`). */
export const AVATAR = "avatar:head";

export const partOf = (id: string): Part | undefined => PARTS.find((p) => p.id === id);
export const setOf = (id: string): SkinSet | undefined => SETS.find((s) => s.id === id);

/** Сборка человека: набор, поверх — части, что он поменял сам (каждая — только своего слота). */
export function partsFor(set: string, own?: Partial<Parts>): Parts {
  const base = (setOf(set) ?? SETS[0]!).parts;
  const out = { ...base };
  for (const slot of SLOTS) if (own?.[slot] && partOf(own[slot]!)?.slot === slot) out[slot] = own[slot]!;
  return out;
}

/** Разбор сборки из сети: часть годна, только если есть и стоит в своём слоте. */
export function cleanParts(raw: unknown): Partial<Parts> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: Partial<Parts> = {};
  for (const slot of SLOTS) if (typeof o[slot] === "string" && partOf(o[slot])?.slot === slot) out[slot] = o[slot];
  return out;
}

/** Набор, который целиком совпадает со сборкой, — или ничего: собрано своё. */
export const setMatching = (parts: Parts): SkinSet | undefined => SETS.find((s) => SLOTS.every((k) => s.parts[k] === parts[k]));

/** Все ракурсы части, какие можно показать: нарисованные и отражённые. */
export const shownViews = (part: Part): string[] => [...part.views, ...Object.keys(part.mirror ?? {})];

/** Запас, с которым ракурс держится на границе: иначе на стыке двух он мигает туда-обратно. */
export const VIEW_HOLD = 0.08;

/**
 * КАКОЙ РАКУРС ПОКАЗАТЬ: `toViewer` — откуда смотрят, в осях части (x — её правая рука, y — вперёд, z — вверх),
 * не обязательно единичный. Ближайший по направлению; прежний (`was`) держится, пока новый лучше не больше
 * чем на `VIEW_HOLD`.
 */
export function pickView(part: Pick<Part, "views" | "mirror">, toViewer: Dir, was?: string): string {
  const len = Math.hypot(...toViewer) || 1;
  const v = toViewer.map((c) => c / len);
  const score = (name: string) => {
    const d = VIEW_DIRS[name];
    return d ? d[0] * v[0]! + d[1] * v[1]! + d[2] * v[2]! : -Infinity;
  };
  let all = shownViews(part as Part);
  // ВЕРХ И НИЗ — С ЗОНОЙ ТОЛЕРАНТНОСТИ. В изометрии бок читается лучше верха, поэтому верх включается, только когда
  // смотрят почти отвесно (`POLE_IN`), а включившись, держится, пока взгляд не опустится заметно в бок (`POLE_OUT`).
  // Между порогами остаётся тот вид, что был: поднялся по диагонали — всё ещё бок; вернулся с отвеса в диагональ —
  // всё ещё верх.
  if (all.includes("top") || all.includes("bottom")) {
    const pole = v[2]! >= 0 ? "top" : "bottom";
    const fromPole = was === "top" || was === "bottom";
    if (all.includes(pole) && Math.abs(v[2]!) > (fromPole ? POLE_OUT : POLE_IN)) return pole;
    all = all.filter((name) => name !== "top" && name !== "bottom");
  }
  let best = all[0]!;
  for (const name of all) if (score(name) > score(best)) best = name;
  if (was && all.includes(was) && score(was) >= score(best) - VIEW_HOLD) return was;
  return best;
}

/** Верх (низ) включается, когда взгляд круче 70° над горизонтом, и держится, пока не станет положе 35°. */
export const POLE_IN = Math.sin((70 * Math.PI) / 180);
export const POLE_OUT = Math.sin((35 * Math.PI) / 180);

/** Картинка ракурса: какой нарисованный ракурс брать и отражать ли его. */
export function drawnView(part: Pick<Part, "mirror">, view: string): { view: string; mirror: boolean } {
  const from = part.mirror?.[view];
  return from ? { view: from, mirror: true } : { view, mirror: false };
}
