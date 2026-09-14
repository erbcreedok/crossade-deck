// СТОЛ НА ХОЛСТЕ — сукно, кромка, стулья, диски и карты в стульях, по числам продукта.
//
// ЕДИНИЦА — ШИРИНА КАРТЫ НА СУКНЕ, ровно как в движке. Всё ниже в ней, а на стекло переносит камера.
// Холст рисует и возвращает, где что легло: разметка сверху (тултипы, рука) ставится ПО ЭТИМ числам,
// а не по выдуманным.

import { apply, invert, type Transform } from "../../game-kit/src/core/transform.js";
import type { Face } from "../src/table/contract.js";

export interface Pose {
  fan: boolean;
  shrink: boolean;
  tuck: boolean;
}

export interface Seat {
  key: string;
  name: string;
  ink: string;
  mine?: boolean;
  cards: number;
  face?: string;
  pose?: Pose;
}

export interface FeltItem {
  id: string;
  x: number;
  y: number;
  up: boolean;
  face?: Face;
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
}

/** Цвета стула — содержание, а не тема (`SEAT_LOOK`). */
export const SEAT = {
  black: "#0b0704",
  gold: "#f2c14e",
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
const HAND_SCALE = 0.55;
const POSE = {
  sideIn: 0.35,
  sideDrop: 0.2,
  tip: 0.25,
  fanIn: 0.17,
  fan: { spread: 60, radius: 2 },
  fanShut: { spread: 14, radius: 2 },
  ladder: { room: 2.2, gapMin: 0.08, gapMax: 0.55 },
};

/** Карта на сукне — одна единица в ширину. */
export const CARD = { w: 1, h: 1.4 };

type Point = { x: number; y: number };

/** ПОРЯДОК РАЗРЕЗАНИЯ ПИЦЦЫ: своя сторона, напротив, слева, справа, дальше пополам. */
function ringOrder(levels = 8): number[] {
  const out = [0, 180];
  for (let k = 2; k <= levels; k += 1) {
    const step = 360 / 2 ** k;
    const fresh: number[] = [];
    for (let i = 0; i < 2 ** k; i += 1) {
      const a = (i * step) % 360;
      if (!out.includes(a) && !fresh.includes(a)) fresh.push(a);
    }
    fresh.sort((a, b) => {
      const near = Math.min(a, 360 - a) - Math.min(b, 360 - b);
      return near !== 0 ? near : b - a;
    });
    const left = new Set(fresh);
    for (const a of fresh) {
      if (!left.has(a)) continue;
      left.delete(a);
      out.push(a);
      const across = (a + 180) % 360;
      if (left.delete(across)) out.push(across);
    }
  }
  return out;
}

/** Точка на круге — те же оси: +y к себе, вниз экрана. */
function ringPlaces(n: number, radius: number): { at: Point; facing: number }[] {
  return ringOrder()
    .slice(0, Math.max(0, n))
    .map((angle) => {
      const t = (angle * Math.PI) / 180;
      return { at: { x: Math.sin(t) * radius, y: Math.cos(t) * radius }, facing: angle };
    });
}

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
    if (pose.shrink) {
      const drift = { x: 0.03, y: -0.03 };
      const reach = 0.03 * Math.max(0, n - 1);
      const k = reach > 0.18 ? 0.18 / reach : 1;
      return Array.from({ length: n }, (_, i) => ({
        at: { x: near + w / 2 + i * drift.x * k * s, y: y + i * drift.y * k * s },
        angle: 0,
      }));
    }
    const step = fitStep(n, POSE.ladder.room * s, POSE.ladder) * s;
    return Array.from({ length: n }, (_, i) => ({ at: { x: near + w / 2 + step * i, y }, angle: 0 }));
  }
  if (pose.tuck) return Array.from({ length: n }, () => ({ at: { x: 0, y: -(ARCH_R + POSE.tip * h) + h / 2 }, angle: 0 }));
  const middle = -(ARCH_R - POSE.fanIn * h) - h / 2;
  return fanPoses(n, pose.shrink ? POSE.fanShut : POSE.fan).map((p) => ({
    at: { x: p.at.x * s, y: middle + p.at.y * s },
    angle: p.angle,
  }));
}

/** ГДЕ ЛЕЖИТ i-Я КАРТА КОЛОДЫ — плотная стопка: снос капнут на всю пачку. */
export function deckAt(i: number, n: number): Point {
  const drift = 0.03;
  const reach = drift * Math.max(0, n - 1);
  const k = reach > 0.18 ? 0.18 / reach : 1;
  return { x: i * drift * k, y: -i * drift * k };
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

export const SUITS: Record<Face["suit"], [string, string]> = { s: ["♠", "#1b1b1b"], h: ["♥", "#9c2f2a"], d: ["♦", "#9c2f2a"], c: ["♣", "#1b1b1b"] };

/**
 * КАРТА В ЕДИНИЦАХ: лицом — знак и ранг, рубашкой — плетёнка. Лица нет — рисуется рубашка, что бы
 * ни просили: неизвестную карту честно показать нечем.
 */
function card(g: CanvasRenderingContext2D, face: Face | undefined, w: number, h: number, held?: string): void {
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
  // ВЗЯТАЯ ДРУГИМ — В ЕГО ЦВЕТЕ И ПРИГЛУШЁННАЯ: её видно, и видно, что она не твоя сейчас.
  if (held) {
    roundRect(g, -w / 2, -h / 2, w, h, w * 0.12);
    g.fillStyle = "rgba(11,7,4,.45)";
    g.fill();
    g.lineWidth = w * 0.09;
    g.strokeStyle = held;
    g.stroke();
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

function disc(g: CanvasRenderingContext2D, who: Seat, images: Record<string, HTMLImageElement>): void {
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
  if (who.mine) {
    g.beginPath();
    g.arc(0, 0, r + DISC_LINE, 0, Math.PI * 2);
    g.lineWidth = DISC_LINE;
    g.strokeStyle = SEAT.gold;
    g.stroke();
  }
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

function chair(g: CanvasRenderingContext2D, who: Seat): void {
  archPath(g, ARCH_R + CHAIR_LINE);
  if (who.mine) {
    g.fillStyle = SEAT.gold;
    g.fill();
  }
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
  deck: { id: string }[];
  felt: FeltItem[];
  /** Id вещи → цвет того, кто её сейчас держит (кроме меня). */
  held: Record<string, string>;
  /** Что несёт мой палец — на сукне его нет, пока не положено. */
  lifted?: string;
  /** Взгляд камеры: единицы стола → пиксели стекла (`Camera.transform()`). */
  view: Transform;
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
  g.fillStyle = ROUND.black;
  g.fillRect(0, 0, W, H);

  // ПЛОСКОСТЬ СТОЛА — ЧЕРЕЗ КАМЕРУ: пан, зум, поворот и наклон одной матрицей. Сукно, карты и стулья
  // лежат в ней; диски с лицами — нет (ниже).
  const v = o.view;
  const desk = () => g.setTransform(dpr * v.a, dpr * v.b, dpr * v.c, dpr * v.d, dpr * v.e, dpr * v.f);
  const toGlass = (p: Point) => apply(v, p);
  const back = invert(v)!;
  const toDesk = (p: Point) => apply(back, p);
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

  const deck = o.deck.filter((one) => one.id !== o.lifted);
  deck.forEach((one, i) => {
    g.save();
    const at = deckAt(i, deck.length);
    g.translate(at.x, at.y);
    card(g, undefined, CARD.w, CARD.h, o.held[one.id]);
    g.restore();
  });

  for (const one of o.felt) {
    if (one.id === o.lifted) continue;
    g.save();
    g.translate(one.x, one.y);
    card(g, one.up ? one.face : undefined, CARD.w, CARD.h, o.held[one.id]);
    g.restore();
  }

  const places = ringPlaces(people.length, R - 1);
  const spots: Spot[] = [];
  places.forEach((place, i) => {
    const who = people[i]!;
    g.save();
    g.translate(place.at.x, place.at.y);
    // СТУЛ ПОВЁРНУТ ЛИЦОМ К СТОЛУ; угол со знаком минус — места считаются от шести часов к +x.
    g.rotate((-place.facing * Math.PI) / 180);
    chair(g, who);
    posePlan(who.pose ?? { fan: false, shrink: false, tuck: false }, who.cards).forEach((p) => {
      g.save();
      g.translate(p.at.x, p.at.y);
      g.rotate((p.angle * Math.PI) / 180);
      card(g, undefined, CARD.w * HAND_SCALE, CARD.h * HAND_SCALE);
      g.restore();
    });
    g.restore();

    // ДИСК СТОИТ, А НЕ ЛЕЖИТ: ни поворот стола, ни наклон его не трогают — лицо смотрит на того, кто
    // глядит на стол (`Oriented: "viewer"` у кита). Ставится в точку стола, размером — по зуму.
    const at = toGlass(place.at);
    g.setTransform(dpr * o.k, 0, 0, dpr * o.k, dpr * at.x, dpr * at.y);
    disc(g, who, images);
    desk();
    spots.push({ key: who.key, x: at.x, y: at.y, r: (DISC / 2) * o.k, seat: place.at });
  });

  return { spots, k: o.k, squash: o.squash, rotation: o.rotation, toGlass, toDesk };
}
