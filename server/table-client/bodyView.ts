// ЧУЖИЕ ТЕЛА НА СТОЛЕ — аватар: палка от стола до плеч, плечи, шея к голове, руки-хваты. Голову (кружок с
// фото, нос-взгляд, затылок со спины) и карты в левой руке рисует сукно (`felt.ts`, `Seat.body`): они там же,
// где аватар стула. Своё тело не рисуется: своя голова — камера.
//
// Всё в единицах стола, размер — по месту: отъехал камерой — тело мельчает вместе со столом, а не держит
// размер экрана. Тело — это стул: оно сидит на месте. Повернул человек камеру на другую сторону стола —
// туда ушли голова и левая рука с картами, а к телу тянется ниточка его цвета; на месте — пустой круг.
//
// Геометрия — общая (`src/table/bodies.ts`); здесь только вид. Пока у всех один вид — аватар; выбор вида
// будет на странице аватара.

import type { Body } from "../src/table/bodies.js";
import { HEAD, NECK, awayOf, headOf, leftHandOf, shoulders3, type Point3 } from "../src/table/bodies.js";
import { DISC } from "./felt.js";

type Point = { x: number; y: number };
/** Точка стола на стекле — с высотой над сукном. */
type ToGlass = (p: Point, h?: number) => Point;

export interface BodyLook {
  body: Body;
  /** Угол стула владельца. */
  angle: number;
  ink: string;
  name: string;
  /** Несёт карту — правая рука сжата и держит её на своей высоте. */
  holding?: boolean;
}

export interface BodyColors {
  black: string;
  ink: string;
  danger: string;
}

/** Кукла в единицах стола: толщина палки, полуширина плеч, кисть. */
const DOLL = { spine: 0.42, bar: 1.4, arm: 0.26, hand: 1.5, seat: 0.8, reach: 5 } as const;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Разметка тел: `toGlass` — точка стола на стекле, `sprite` — адрес картинки руки. */
export function bodiesHtml(all: readonly BodyLook[], toGlass: ToGlass, T: BodyColors, sprite: (name: string) => string): string {
  return all.map((one) => avatarHtml(one, toGlass, T, sprite)).join("");
}

function avatarHtml({ body, angle, ink, name, holding }: BodyLook, toGlass: ToGlass, T: BodyColors, sprite: (name: string) => string): string {
  const at = (p: Point3): Point => toGlass(p, p.h);
  // МЕСТНЫЙ МАСШТАБ — пикселей в единице стола в этой точке и на этой высоте: дальше и ниже — мельче.
  const kAt = (p: Point3): number => {
    const a = at(p), b = toGlass({ x: p.x + 0.5, y: p.y }, p.h);
    return Math.hypot(b.x - a.x, b.y - a.y) * 2;
  };
  const s = shoulders3(angle, body.stance);
  const away = awayOf(s, body.yaw);
  const head = headOf(s, body.eye, body.stretch, body.yaw);
  const left = leftHandOf(head, body.yaw);
  // Лицом к столу: правое плечо — справа от взгляда внутрь.
  const r = Math.hypot(s.x, s.y) || 1;
  const inward = { x: -s.x / r, y: -s.y / r };
  const rightDir = { x: -inward.y, y: inward.x };
  const shoulder = (d: number): Point3 => ({ x: s.x + rightDir.x * d, y: s.y + rightDir.y * d, h: s.h });
  const shL = shoulder(-DOLL.bar), shR = shoulder(DOLL.bar);
  const k = kAt(s);
  const S = at(s), H = at(head), L = at(left), base = toGlass(s, 0);
  const line = (a: Point, b: Point, w: number, color: string, extra = "") =>
    `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${color}" stroke-width="${Math.max(1.5, w).toFixed(1)}" stroke-linecap="round"${extra}/>`;
  const stick = (a: Point, b: Point, w: number) => line(a, b, w * k, T.black) + line(a, b, w * k * 0.55, ink);
  // Правая рука — у пальца; несёт карту — на той высоте, где висит карта: на доле высоты его головы.
  const right: Point3 | null = body.right ? { ...body.right, h: holding ? HEAD.lift * head.h : 0.4 } : null;
  // ШЕЯ ДОХОДИТ ДО КРОМКИ ГОЛОВЫ, а не до её середины: голова — аватар, шея не перечёркивает лицо.
  const len = Math.hypot(H.x - S.x, H.y - S.y) || 1;
  const cut = Math.min(len, (DISC / 2) * kAt(head));
  const chin = { x: H.x - ((H.x - S.x) / len) * cut, y: H.y - ((H.y - S.y) / len) * cut };
  const strained = body.stretch > NECK.free;
  const svg = `<svg style="position:absolute;left:0;top:0;overflow:visible" width="1" height="1">`
    // Ушёл головой с места — пустой круг его цвета у стула: видно, откуда он смотрит в другую сторону.
    + (away ? `<circle data-g="empty-seat" cx="${base.x.toFixed(1)}" cy="${base.y.toFixed(1)}" r="${(DOLL.seat * kAt({ ...s, h: 0 })).toFixed(1)}" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="5 4" opacity=".7"/>` : "")
    // Палка — от стола до плеч, плечи — поперёк.
    + stick(base, S, DOLL.spine)
    + stick(at(shL), at(shR), DOLL.spine)
    // Руки палкой от плеч — пока голова у тела; ушла — руки ушли с ней.
    // Правая — курсор: дальше вытянутой руки кисть висит сама, палка через весь стол не тянется.
    + (away ? "" : stick(at(shL), L, DOLL.arm) + (right && Math.hypot(right.x - shR.x, right.y - shR.y) <= DOLL.reach ? stick(at(shR), at(right), DOLL.arm) : ""))
    // Шея — или ниточка, если голова на другой стороне стола.
    + (away
      ? line(S, H, 2, ink, ` stroke-dasharray="3 5" opacity=".55" data-g="tether"`)
      : line(S, chin, DOLL.spine * k, T.black) + line(S, chin, DOLL.spine * k * 0.55, strained ? T.danger : ink))
    + `</svg>`;
  // РУКИ-ХВАТЫ: нарисованы правой рукой; левая — отражённая. Размер — по месту кисти.
  const hand = (p: Point3, img: string, g: string, mirror: boolean) => {
    const q = at(p), w = DOLL.hand * kAt(p);
    return `<img data-g="${g}" src="${sprite(img)}" alt="" draggable="false" style="position:absolute;left:${(q.x - w / 2).toFixed(1)}px;top:${(q.y - w / 2).toFixed(1)}px;width:${w.toFixed(1)}px;height:${w.toFixed(1)}px;pointer-events:none${mirror ? ";transform:scaleX(-1)" : ""}">`;
  };
  return `<div data-g="body" data-model="avatar" data-by="${esc(body.by)}" data-name="${esc(name)}" data-stance="${body.stance}" data-stretch="${body.stretch.toFixed(2)}" data-away="${away ? 1 : 0}" data-head-h="${head.h.toFixed(2)}" style="position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:24">`
    + svg
    + hand(left, "hand-closed", "left-hand", true)
    + (right ? hand(right, holding ? "hand-closed" : "hand-open", "right-hand", false) : "")
    + `</div>`;
}
