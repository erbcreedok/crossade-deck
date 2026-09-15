// СТОЛ НА ХОЛСТЕ — сукно, кромка, стулья, диски и карты в стульях, по числам продукта.
//
// ЕДИНИЦА — ШИРИНА КАРТЫ НА СУКНЕ, ровно как в движке. Всё ниже в ней, а на стекло переносит камера.
// Холст рисует и возвращает, где что легло: разметка сверху (тултипы, рука) ставится ПО ЭТИМ числам,
// а не по выдуманным.

import { apply, invert, type Transform } from "../../game-kit/src/core/transform.js";
import type { Face } from "../src/table/contract.js";
import { seatPoint, SEAT_RADIUS } from "../src/table/ring.js";

export interface Pose {
  fan: boolean;
  shrink: boolean;
  tuck: boolean;
}

/** Стул, каким его рисуют: `key` — id стула; без `name` он покинут. */
export interface Seat {
  key: string;
  /** Угол места в осях СТОЛА, как его прислал сервер, — один у всех. Свой стул внизу ставит камера. */
  angle: number;
  name?: string;
  ink?: string;
  mine?: boolean;
  cards: number;
  /** Карты руки по порядку, каким их видно на стуле: лицо — только у перевёрнутой. Щели — дальше, без карт. */
  hand?: { id: string; face?: Face }[];
  face?: string;
  pose?: Pose;
}

export interface FeltItem {
  id: string;
  x: number;
  y: number;
  up: boolean;
  /** Поворот в осях стола, в градусах по часовой. */
  angle: number;
  face?: Face;
  /** Лежит под колодой (козырь): рисуется раньше неё. */
  under?: boolean;
}

/** Где сидит человек: диск на стекле (`x`, `y`, `r` — пиксели) и его стул на столе (`seat` — единицы). */
export interface Spot {
  key: string;
  x: number;
  y: number;
  r: number;
  seat: Point;
}

/** Где что легло, и как переводить между столом и стеклом — тем же взглядом, каким рисовали. */
export interface FeltView {
  spots: Spot[];
  /** Пикселей стекла в единице стола сейчас (с зумом). */
  k: number;
  /** Во сколько раз наклон сжимает высоту (`cos(pitch)`). */
  squash: number;
  /** Поворот стола на стекле, в градусах. */
  rotation: number;
  toGlass(p: { x: number; y: number }): { x: number; y: number };
  toDesk(p: { x: number; y: number }): { x: number; y: number };
  /** Где на столе нарисована i-я карта стопки `pile` из n — со сдвигом стопки и её высотой. */
  deckAt(pile: string, i: number, n: number): { x: number; y: number };
  /** Где на столе нарисована карта сукна — поднятая, если лежит на других. */
  feltAt(id: string): { x: number; y: number } | undefined;
}

/**
 * ТОЛЩИНА КАРТЫ В СТОПКЕ — доля ширины карты: колода из 36 при наибольшем наклоне стоит на треть ширины.
 * Высота растёт с наклоном: сверху (0°) её не видно, и остаётся только сдвиг стопки.
 */
const CARD_THICK = 1 / 3 / 36;
/** Сдвиг карты колоды к правому верхнему углу ЭКРАНА — какой бы ни был поворот камеры. */
const DECK_DRIFT = { each: 0.03, most: 0.18 };
/**
 * КАРТА НА КАРТЕ — поднята ровно на толщину карты, как в колоде: сверху не поднята вовсе, при наклоне —
 * настолько, насколько стопка выросла бы. Щели между картами быть не должно: видно обводку, а не зазор.
 */
const FELT_LEVEL = { flat: 0, tilt: CARD_THICK };
/** Карты сукна перекрываются, если их середины ближе этого, в единицах. */
const FELT_OVERLAP = 1.2;

/** Цвета стула — содержание, а не тема (`SEAT_LOOK`). */
export const SEAT = {
  black: "#0b0704",
  ink: "#f5ead0",
  woodHi: "#6b4d2c",
  woodLo: "#1d1409",
  cream: "#cdb98f",
  discHi: "#3d4a3a",
  discLo: "#1b2418",
};

/** Цвета стола (`ROUND_LOOK`). */
const ROUND = {
  feltHi: "#1b4835",
  feltMid: "#123527",
  feltLo: "#0a2117",
  black: "#0b0704",
  woodDark: "#3a2a1d",
  woodLight: "#6b4d2c",
};

/** Стол: радиус сукна и три кольца кромки. */
export const R = 8;
const EDGE = { line: 0.09, dark: 0.33, light: 0.18 };
export const RIM = EDGE.line + EDGE.dark + EDGE.light;

/** Стул: арка и её линия. */
const ARCH_R = 1.1;
const CHAIR_LINE = 0.09;
/**
 * ДОКУДА ОТ СЕРЕДИНЫ МЕСТА ДОСТАЁТ СТУЛ, в единицах: арка — полукруг спереди и квадрат спинки сзади,
 * и дальше всего от середины — угол спинки. Касание в этом круге — касание стула.
 */
export const SEAT_REACH = (ARCH_R + CHAIR_LINE) * Math.SQRT2;
/** Диск и табличка под ним. */
export const DISC = 1.6;
const DISC_LINE = 0.09;
const PLATE = { at: 1.34, padX: 0.24, padY: 0.09, line: 0.06 };
const PLATE_EM = 0.24;
const GLYPH_EM = 0.5;

/** Карта в стуле: её доля от карты на сукне и её поза. */
export const HAND_SCALE = 0.55;
const POSE = {
  sideIn: 0.35,
  sideDrop: 0.2,
  tip: 0.25,
  fanIn: 0.17,
  fan: { spread: 60, radius: 2 },
  shrinkOut: 0.5,
  ladder: { room: 2.2, gapMin: 0.08, gapMax: 0.55 },
};

/** Карта на сукне — одна единица в ширину. */
export const CARD = { w: 1, h: 1.4 };

type Point = { x: number; y: number };

function fanPoses(n: number, { spread, radius }: { spread: number; radius: number }) {
  return Array.from({ length: n }, (_, i) => {
    const angle = n < 2 ? 0 : -spread / 2 + (spread * i) / (n - 1);
    const rad = (angle * Math.PI) / 180;
    return { at: { x: radius * Math.sin(rad), y: radius * (1 - Math.cos(rad)) }, angle };
  });
}

function fitStep(n: number, room: number, look: { gapMin: number; gapMax: number }): number {
  if (n < 2) return 0;
  return Math.max(look.gapMin, Math.min(look.gapMax, room / (n - 1)));
}

/** ГДЕ ЛЕЖИТ КАЖДАЯ КАРТА РУКИ В СТУЛЕ — в системе самого стула: +y сторона хозяина, -y стол. */
function posePlan(pose: Pose, n: number): { at: Point; angle: number }[] {
  const s = HAND_SCALE;
  const w = CARD.w * s;
  const h = CARD.h * s;
  if (!pose.fan) {
    const y = POSE.sideDrop * h;
    const near = ARCH_R - POSE.sideIn;
    if (pose.tuck) return Array.from({ length: n }, () => ({ at: { x: ARCH_R + POSE.tip * w - w / 2, y }, angle: 0 }));
    // СЖАТЫ — одна карта, остальные стопкой за ней.
    if (pose.shrink) return Array.from({ length: n }, () => ({ at: { x: near + w / 2, y }, angle: 0 }));
    const step = fitStep(n, POSE.ladder.room * s, POSE.ladder) * s;
    return Array.from({ length: n }, (_, i) => ({ at: { x: near + w / 2 + step * i, y }, angle: 0 }));
  }
  if (pose.tuck) return Array.from({ length: n }, () => ({ at: { x: 0, y: -(ARCH_R + POSE.tip * h) + h / 2 }, angle: 0 }));
  const middle = -(ARCH_R - POSE.fanIn * h) - h / 2;
  // Одна карта веера выдвинута к столу дальше обычного: на месте середины веера её закрыла бы табличка с именем.
  if (pose.shrink) return Array.from({ length: n }, () => ({ at: { x: 0, y: middle - POSE.shrinkOut * h }, angle: 0 }));
  return fanPoses(n, POSE.fan).map((p) => ({
    at: { x: p.at.x * s, y: middle + p.at.y * s },
    angle: p.angle,
  }));
}

/** Этаж каждой карты сукна: лежит на перекрытой — на один выше самой высокой из-под себя. */
function feltLevels(felt: readonly { id: string; x: number; y: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  felt.forEach((one, i) => {
    let level = 0;
    for (let j = 0; j < i; j += 1) {
      const under = felt[j]!;
      if (Math.hypot(one.x - under.x, one.y - under.y) < FELT_OVERLAP) level = Math.max(level, (out.get(under.id) ?? 0) + 1);
    }
    out.set(one.id, level);
  });
  return out;
}

function archPath(g: CanvasRenderingContext2D, r: number): void {
  const k = 0.5523 * r;
  g.beginPath();
  g.moveTo(-r, 0);
  g.bezierCurveTo(-r, -k, -k, -r, 0, -r);
  g.bezierCurveTo(k, -r, r, -k, r, 0);
  g.lineTo(r, r);
  g.lineTo(-r, r);
  g.closePath();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

export const SUITS: Record<Face["suit"], [string, string]> = { s: ["♠", "#1b1b1b"], h: ["♥", "#9c2f2a"], d: ["♦", "#9c2f2a"], c: ["♣", "#1b1b1b"], r: ["★", "#9c2f2a"], b: ["★", "#1b1b1b"] };

/**
 * КАРТА В ЕДИНИЦАХ: лицом — знак и ранг, рубашкой — плетёнка. Лица нет — рисуется рубашка, что бы
 * ни просили: неизвестную карту честно показать нечем.
 */
function card(g: CanvasRenderingContext2D, face: Face | undefined, w: number, h: number, held?: string, art?: CardArt, pick?: string): void {
  const picture = art?.(face);
  if (picture) {
    // ЧЁРНАЯ КРОМКА — примета стола на HTML: картинка обрезана по скруглению и обведена.
    g.save();
    roundRect(g, -w / 2, -h / 2, w, h, w * 0.12);
    g.clip();
    g.drawImage(picture, -w / 2, -h / 2, w, h);
    g.restore();
    roundRect(g, -w / 2, -h / 2, w, h, w * 0.12);
    g.lineWidth = w * 0.05;
    g.strokeStyle = SEAT.black;
    g.stroke();
  } else paperCard(g, face, w, h);
  // ВЗЯТАЯ ДРУГИМ — В ЕГО ЦВЕТЕ И ПРИГЛУШЁННАЯ: её видно, и видно, что она не твоя сейчас.
  if (held) {
    roundRect(g, -w / 2, -h / 2, w, h, w * 0.12);
    g.fillStyle = "rgba(11,7,4,.45)";
    g.fill();
    g.lineWidth = w * 0.09;
    g.strokeStyle = held;
    g.stroke();
  }
  // ВЫДЕЛЕНА ЛАССО — рамка в цвете выделившего поверх чёрной, без затемнения: карта не взята, а отмечена.
  if (pick && !held) {
    roundRect(g, -w / 2 - w * 0.03, -h / 2 - w * 0.03, w + w * 0.06, h + w * 0.06, w * 0.15);
    g.lineWidth = w * 0.14;
    g.strokeStyle = SEAT.black;
    g.stroke();
    g.lineWidth = w * 0.08;
    g.strokeStyle = pick;
    g.stroke();
  }
}

/** Картинка карты стола: лицо в наборе стола или рубашка (`deckArt.ts`). Не загружена — `undefined`. */
export type CardArt = (face: Face | undefined) => HTMLImageElement | undefined;

/** Карта, пока картинка не пришла: знак и ранг, рубашкой — плетёнка. */
function paperCard(g: CanvasRenderingContext2D, face: Face | undefined, w: number, h: number): void {
  roundRect(g, -w / 2, -h / 2, w, h, w * 0.12);
  g.fillStyle = face ? "#f5ead0" : "#4a3627";
  g.fill();
  g.lineWidth = w * 0.05;
  g.strokeStyle = SEAT.black;
  g.stroke();
  if (!face) {
    g.save();
    g.clip();
    g.strokeStyle = "#6b4d2c";
    g.lineWidth = w * 0.05;
    for (let i = -h; i < w + h; i += w * 0.16) {
      g.beginPath();
      g.moveTo(-w / 2 + i, -h / 2);
      g.lineTo(-w / 2 + i + h, h / 2);
      g.stroke();
    }
    g.restore();
  } else {
    const [sign, colour] = SUITS[face.suit];
    g.fillStyle = colour;
    g.textAlign = "left";
    g.textBaseline = "top";
    g.font = `${w * 0.3}px Tiny5, monospace`;
    g.fillText(face.rank, -w / 2 + w * 0.1, -h / 2 + w * 0.06);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${w * 0.45}px Tiny5, monospace`;
    g.fillText(sign, 0, h * 0.05);
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0])
    .join("")
    .toUpperCase();
}

function disc(g: CanvasRenderingContext2D, who: Seat & { name: string; ink: string }, images: Record<string, HTMLImageElement>): void {
  const r = DISC / 2;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = SEAT.black;
  g.fill();
  const inner = r - DISC_LINE;
  const picture = who.face ? images[who.face] : undefined;
  if (picture && picture.complete && picture.naturalWidth > 0) {
    g.save();
    g.beginPath();
    g.arc(0, 0, inner, 0, Math.PI * 2);
    g.clip();
    g.drawImage(picture, -inner, -inner, inner * 2, inner * 2);
    g.restore();
  } else {
    const grad = g.createLinearGradient(0, -r, 0, r);
    grad.addColorStop(0, SEAT.discHi);
    grad.addColorStop(1, SEAT.discLo);
    g.beginPath();
    g.arc(0, 0, inner, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
    g.fillStyle = SEAT.ink;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${GLYPH_EM}px Tiny5, monospace`;
    g.fillText(initials(who.name), 0, GLYPH_EM * 0.08);
  }
  g.beginPath();
  g.arc(0, 0, inner, 0, Math.PI * 2);
  g.lineWidth = DISC_LINE;
  g.strokeStyle = who.ink;
  g.stroke();
  const w = Math.max(1, [...who.name].length * PLATE_EM + 2 * PLATE.padX);
  const h = PLATE_EM * 1.6 + 2 * PLATE.padY;
  roundRect(g, -w / 2, PLATE.at - h / 2, w, h, h * 0.3);
  g.fillStyle = SEAT.black;
  g.fill();
  g.lineWidth = PLATE.line;
  g.strokeStyle = who.ink;
  g.stroke();
  g.fillStyle = SEAT.ink;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `${PLATE_EM}px Tiny5, monospace`;
  g.fillText(who.name, 0, PLATE.at);
}

/**
 * ПОКИНУТЫЙ СТУЛ — та же арка, но без хозяина: без цвета, без диска, кремовым пунктиром. Карты в нём
 * лежат, как лежали: на него смотрят именно ради них.
 */
function emptyChair(g: CanvasRenderingContext2D): void {
  archPath(g, ARCH_R);
  g.fillStyle = "rgba(11,7,4,.55)";
  g.fill();
  g.save();
  g.lineWidth = CHAIR_LINE;
  g.strokeStyle = SEAT.cream;
  g.setLineDash([0.24, 0.16]);
  g.stroke();
  g.restore();
}

function chair(g: CanvasRenderingContext2D, who: Seat & { ink: string }): void {
  archPath(g, ARCH_R);
  g.fillStyle = SEAT.black;
  g.fill();
  const grad = g.createLinearGradient(0, -ARCH_R, 0, ARCH_R);
  grad.addColorStop(0, SEAT.woodHi);
  grad.addColorStop(1, SEAT.woodLo);
  archPath(g, ARCH_R - CHAIR_LINE / 2);
  g.save();
  g.globalAlpha = 0.5;
  g.fillStyle = grad;
  g.fill();
  g.restore();
  g.lineWidth = CHAIR_LINE;
  g.strokeStyle = who.ink;
  g.stroke();
}

export interface FeltScene {
  W: number;
  H: number;
  people: Seat[];
  images: Record<string, HTMLImageElement>;
  /** Картинки карт стола. */
  art?: CardArt;
  /** Карта переворачивается: доля пути и какой она была до (сторона и лицо). */
  turning?: (id: string) => { p: number; up: boolean; face?: Face } | undefined;
  /** Стопки в порядке «кто сверху»: место, поворот, что под ней и карты снизу вверх. */
  piles: (Point & { id: string; angle: number; below: readonly string[]; cards: { id: string; face?: Face; up?: boolean }[] })[];
  felt: FeltItem[];
  /** Id вещи → цвет того, кто её сейчас держит (кроме меня). */
  held: Record<string, string>;
  /** Id карты → цвет того, кто её выделил лассо. */
  picked?: Record<string, string>;
  /** Что несёт мой палец — на сукне его нет, пока не положено. */
  lifted?: string;
  /** Что сейчас летит поверх стола копией — на месте его не рисуют, пока не долетит. */
  hidden?: ReadonlySet<string>;
  /** Взгляд камеры: единицы стола → пиксели стекла (`Camera.transform()`). */
  view: Transform;
  /** Наклон как доля наибольшего: 0 — сверху, 1 — лёг до конца. Даёт стопкам высоту. */
  rise: number;
  k: number;
  squash: number;
  rotation: number;
}

/** Стол целиком, с кромкой, в единицах — то, что камера держит в кадре. */
export const DESK_BOX = { x: -(R + RIM), y: -(R + RIM), w: 2 * (R + RIM), h: 2 * (R + RIM) };

/** НАРИСОВАТЬ СТОЛ И ВЕРНУТЬ, ГДЕ ЧТО ЛЕЖИТ. */
export function drawFelt(canvas: HTMLCanvasElement, o: FeltScene): FeltView {
  const { W, H, people, images } = o;
  const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const g = canvas.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // За столом — фон страницы (`ground.ts`): холст вокруг стола прозрачный.
  g.clearRect(0, 0, W, H);

  // ПЛОСКОСТЬ СТОЛА — ЧЕРЕЗ КАМЕРУ: пан, зум, поворот и наклон одной матрицей. Сукно, карты и стулья
  // лежат в ней; диски с лицами — нет (ниже).
  const v = o.view;
  const desk = () => g.setTransform(dpr * v.a, dpr * v.b, dpr * v.c, dpr * v.d, dpr * v.e, dpr * v.f);
  const toGlass = (p: Point) => apply(v, p);
  const back = invert(v)!;
  const toDesk = (p: Point) => apply(back, p);
  // СДВИГ НА ЭКРАНЕ → СДВИГ НА СТОЛЕ. Стопка растёт вверх и вправо по экрану, а рисуется в осях стола:
  // обратная матрица без переноса поворачивает, растягивает наклон назад и делит на зум.
  const turn = invert({ a: v.a, b: v.b, c: v.c, d: v.d, e: 0, f: 0 });
  const onScreen = (dx: number, dy: number): Point => (turn ? apply(turn, { x: dx * o.k, y: dy * o.k }) : { x: dx, y: -dy });
  const deckAt = (pile: string, i: number, n: number): Point => {
    const reach = DECK_DRIFT.each * Math.max(0, n - 1);
    const drift = DECK_DRIFT.each * (reach > DECK_DRIFT.most ? DECK_DRIFT.most / reach : 1);
    const up = onScreen(i * drift, -i * (drift + CARD_THICK * o.rise));
    const spot = o.piles.find((one) => one.id === pile);
    return { x: (spot?.x ?? 0) + up.x, y: (spot?.y ?? 0) + up.y };
  };
  const levels = feltLevels(o.felt);
  const feltAt = (id: string): Point | undefined => {
    const one = o.felt.find((f) => f.id === id);
    if (!one) return undefined;
    const lift = onScreen(0, -(levels.get(id) ?? 0) * (FELT_LEVEL.flat + FELT_LEVEL.tilt * o.rise));
    return { x: one.x + lift.x, y: one.y + lift.y };
  };
  desk();

  const ring = (radius: number, paint: string | CanvasGradient) => {
    g.beginPath();
    g.arc(0, 0, radius, 0, Math.PI * 2);
    g.fillStyle = paint;
    g.fill();
  };
  ring(R + RIM, ROUND.black);
  ring(R + EDGE.dark + EDGE.light, ROUND.woodDark);
  ring(R + EDGE.light, ROUND.woodLight);
  const felt = g.createRadialGradient(0, 0, 0, 0, 0, R);
  felt.addColorStop(0, ROUND.feltHi);
  felt.addColorStop(0.62, ROUND.feltMid);
  felt.addColorStop(1, ROUND.feltLo);
  ring(R, felt);

  /**
   * КАРТА НА ХОЛСТЕ — со своим переворотом. Переворот сжимает её по ширине до нуля и разжимает: первую
   * половину видна прежняя сторона, вторую — новая. Место, угол и порядок — те же.
   */
  const paint = (id: string, face: Face | undefined, w: number, h: number, held?: string) => {
    const turn = o.turning?.(id);
    if (!turn) return card(g, face, w, h, held, o.art, o.picked?.[id]);
    g.save();
    g.scale(Math.max(0.02, Math.abs(Math.cos(Math.PI * turn.p))), 1);
    card(g, turn.p < 0.5 ? (turn.up ? turn.face : undefined) : face, w, h, held, o.art, o.picked?.[id]);
    g.restore();
  };

  // ПОД КОЛОДОЙ — раньше колоды: козырь торчит из-под неё.
  const paintFelt = (one: FeltItem) => {
    if (one.id === o.lifted || o.hidden?.has(one.id)) return;
    const at = feltAt(one.id)!;
    // ПОДНЯТАЯ КАРТА ОТБРАСЫВАЕТ ТЕНЬ туда, где лежала бы на сукне: так видно, что под ней другая.
    if ((levels.get(one.id) ?? 0) > 0) {
      g.save();
      g.translate(one.x, one.y);
      g.rotate((one.angle * Math.PI) / 180);
      roundRect(g, -CARD.w / 2, -CARD.h / 2, CARD.w, CARD.h, CARD.w * 0.12);
      g.fillStyle = "rgba(11,7,4,.45)";
      g.fill();
      g.restore();
    }
    g.save();
    g.translate(at.x, at.y);
    g.rotate((one.angle * Math.PI) / 180);
    paint(one.id, one.up ? one.face : undefined, CARD.w, CARD.h, o.held[one.id]);
    g.restore();
  };
  // ПОД СТОПКОЙ — и то, что лежало на сукне, когда её поставили: стопки по очереди «кто сверху», и перед
  // каждой — ещё не нарисованные карты из-под неё.
  const drawn = new Set<string>();
  const paintOnce = (one: FeltItem) => {
    if (drawn.has(one.id)) return;
    drawn.add(one.id);
    paintFelt(one);
  };
  for (const one of o.felt) if (one.under) paintOnce(one);
  for (const pile of o.piles) {
    const below = new Set(pile.below);
    for (const one of o.felt) if (below.has(one.id)) paintOnce(one);
    const cards = pile.cards.filter((one) => one.id !== o.lifted && !o.hidden?.has(one.id));
    cards.forEach((one, i) => {
      g.save();
      const at = deckAt(pile.id, i, cards.length);
      g.translate(at.x, at.y);
      g.rotate((pile.angle * Math.PI) / 180);
      paint(one.id, one.up ? one.face : undefined, CARD.w, CARD.h, o.held[one.id]);
      g.restore();
    });
  }

  for (const one of o.felt) paintOnce(one);

  const spots: Spot[] = [];
  people.forEach((who) => {
    const place = { at: seatPoint(who.angle, SEAT_RADIUS), facing: who.angle };
    g.save();
    g.translate(place.at.x, place.at.y);
    // СТУЛ ПОВЁРНУТ ЛИЦОМ К СТОЛУ; угол со знаком минус — места считаются от шести часов к +x.
    g.rotate((-place.facing * Math.PI) / 180);
    const sitter = who.name !== undefined && who.ink !== undefined ? (who as Seat & { name: string; ink: string }) : null;
    if (sitter) chair(g, sitter);
    else emptyChair(g);
    posePlan(who.pose ?? { fan: false, shrink: false, tuck: false }, who.cards).forEach((p, i) => {
      g.save();
      g.translate(p.at.x, p.at.y);
      g.rotate((p.angle * Math.PI) / 180);
      const one = who.hand?.[i];
      if (one) paint(one.id, one.face, CARD.w * HAND_SCALE, CARD.h * HAND_SCALE);
      else card(g, undefined, CARD.w * HAND_SCALE, CARD.h * HAND_SCALE, undefined, o.art);
      g.restore();
    });
    g.restore();

    // ДИСК СТОИТ, А НЕ ЛЕЖИТ: ни поворот стола, ни наклон его не трогают — лицо смотрит на того, кто
    // глядит на стол (`Oriented: "viewer"` у кита). Ставится в точку стола, размером — по зуму.
    const at = toGlass(place.at);
    if (sitter) {
      g.setTransform(dpr * o.k, 0, 0, dpr * o.k, dpr * at.x, dpr * at.y);
      disc(g, sitter, images);
      desk();
    }
    spots.push({ key: who.key, x: at.x, y: at.y, r: (DISC / 2) * o.k, seat: place.at });
  });

  return { spots, k: o.k, squash: o.squash, rotation: o.rotation, toGlass, toDesk, deckAt, feltAt };
}
