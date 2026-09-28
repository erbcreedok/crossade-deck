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
import { HEAD, NECK, awayOf, gazeOf, headOf, leftHandOf, shoulders3, type Point3 } from "../src/table/bodies.js";
import type { Doll } from "../src/table/dolls.js";
import { ART, EXTEND, dollSprite, type Part } from "./dollSprites.js";
import { DISC, R, RIM } from "./felt.js";

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
  /** Кем сидит: кукла и расцветка (`dolls.ts`). */
  doll: Doll;
  palette: number;
}

/** Где взять векторы кукол и кого позвать, когда спрайт испёкся. */
export interface DollSource {
  base: string;
  ready: () => void;
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
export function bodiesHtml(all: readonly BodyLook[], toGlass: ToGlass, T: BodyColors, sprite: (name: string) => string, dolls?: DollSource): string {
  return all.map((one) => (dolls && dollHtml(one, toGlass, T, sprite, dolls)) || avatarHtml(one, toGlass, T, sprite)).join("");
}

// ── КУКЛА: король или дама — как утверждено на стенде `design/persona`. ────────────────────────────────
/** Кукла в единицах стола: ширина головы, туловища, во сколько туловище вытянуто по высоте. */
export const DOLL_SIZE = { head: 2.4, torso: 5.2, stretch: 1.3 } as const;
/** Край стола с кромкой, в единицах: за него туловище уходит под стол. */
const TABLE_EDGE = R + RIM;

const local = (toGlass: ToGlass, p: Point3): number => {
  const a = toGlass(p, p.h), b = toGlass({ x: p.x + 0.5, y: p.y }, p.h);
  return Math.hypot(b.x - a.x, b.y - a.y) * 2;
};

export interface DollPose {
  shoulders: Point3;
  head: Point3;
  left: Point3;
  /** Верх куклы в мире (единичный): стоит — вверх; сверху ложится «от стола наружу» по своему месту. */
  up: Point3;
  /** Верх ушедшей головы — по её взгляду, а не по стулу. */
  headUp: Point3;
  away: boolean;
  headH: number;
}

/**
 * ПОЗА КУКЛЫ. Верх куклы свой: чем круче камера смотрит сверху, тем больше он уходит от вертикали к «от
 * стола наружу» по её месту, — сверху она не сплющивается и не переворачивается от поворота камеры. Голова
 * пришита к вороту по этому верху; всё, чем голова отличается от покоя (нагнулся, ушёл за камерой),
 * прибавляется поверх. Ушла на другую сторону стола — стоит там сама, верх — по её взгляду.
 */
export function dollPose(body: Body, angle: number, doll: Doll, toGlass: ToGlass): DollPose {
  const s = shoulders3(angle, body.stance);
  const away = awayOf(s, body.yaw);
  const head = headOf(s, body.eye, body.stretch, body.yaw);
  const rest = headOf(s, { x: 0, y: 0, h: 1e3 }, 0);
  // Насколько виден рост: вертикаль на экране против шага по сукну. Сверху — ноль, сбоку — единица.
  const k = local(toGlass, s) || 1;
  const a = toGlass(s, s.h), b = toGlass(s, s.h + 1);
  const q = Math.min(Math.PI / 2, 2 * Math.asin(Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / k)));
  const r = Math.hypot(s.x, s.y) || 1;
  const up = { x: (s.x / r) * Math.cos(q), y: (s.y / r) * Math.cos(q), h: Math.sin(q) };
  const g = gazeOf(body.yaw);
  const headUp = { x: -g.x * Math.cos(q), y: -g.y * Math.cos(q), h: Math.sin(q) };
  const art = ART[doll];
  const headH = (DOLL_SIZE.head * art.head[3]) / art.head[2];
  const lift = headH * 0.45 + 0.2;
  const dollHead = away ? head : { x: s.x + up.x * lift + head.x - rest.x, y: s.y + up.y * lift + head.y - rest.y, h: s.h + up.h * lift + head.h - rest.h };
  return { shoulders: s, head: dollHead, left: leftHandOf(dollHead, body.yaw), up, headUp, away, headH };
}

function dollHtml({ body, angle, ink, name, holding, doll, palette }: BodyLook, toGlass: ToGlass, T: BodyColors, sprite: (name: string) => string, src: DollSource): string | null {
  const pose = dollPose(body, angle, doll, toGlass);
  const art = ART[doll];
  const at = (p: Point3): Point => toGlass(p, p.h);
  const S = at(pose.shoulders), H = at(pose.head);
  // ЛИЦОМ ИЛИ СПИНОЙ: смотрит от меня — вверх по экрану — я вижу затылок и спину.
  const g = gazeOf(body.yaw);
  const ahead = at({ x: pose.head.x + g.x, y: pose.head.y + g.y, h: pose.head.h });
  const behind = (ahead.y - H.y) / (Math.hypot(ahead.x - H.x, ahead.y - H.y) || 1) < -0.35;
  const part = (front: Part, back: Part) => dollSprite(doll, palette, behind ? back : front, ink, src.base, src.ready);
  const torso = part("body", "bodyBack"), face = part("head", "headBack");
  if (!torso || !face) return null;
  /** Картинка на плоскости: верх — мировой вектор `up` в точке `P`, ширина — поперёк него на экране. */
  const plane = (img: { src: string; w: number; h: number }, P: Point3, up: Point3, w: number, h: number, pivot: [number, number], mirror: boolean, g: string, clipBottom = 0) => {
    const k = local(toGlass, P);
    const o = at(P), t = at({ x: P.x + up.x, y: P.y + up.y, h: P.h + up.h });
    const ay = { x: t.x - o.x, y: t.y - o.y };
    const len = Math.hypot(ay.x, ay.y) || 1;
    const ax = { x: (-ay.y / len) * k * (mirror ? -1 : 1), y: (ay.x / len) * k * (mirror ? -1 : 1) };
    const tl = { x: o.x - ax.x * w * pivot[0] + ay.x * h * pivot[1], y: o.y - ax.y * w * pivot[0] + ay.y * h * pivot[1] };
    const m = [(ax.x * w) / img.w, (ax.y * w) / img.w, (-ay.x * h) / img.h, (-ay.y * h) / img.h, tl.x, tl.y].map((v) => v.toFixed(4)).join(",");
    return `<img data-g="${g}" src="${img.src}" alt="" draggable="false" style="position:absolute;left:0;top:0;width:${img.w}px;height:${img.h}px;transform-origin:0 0;transform:matrix(${m});pointer-events:none${clipBottom > 0 ? `;clip-path:inset(0 0 ${(clipBottom * 100).toFixed(1)}% 0)` : ""}">`;
  };
  // ТУЛОВИЩЕ СТОИТ ЗА СТОЛОМ: линия плеч — на высоте плеч, всё, что ниже уровня стола, срезано.
  const tw = DOLL_SIZE.torso, th = ((tw * torso.h) / torso.w) * DOLL_SIZE.stretch;
  const py = art.shoulder / (1 + EXTEND);
  // Видно от плеч вниз, пока туловище не ушло под стол: ниже уровня сукна — или (сверху, когда кукла лежит за
  // кромкой) за край стола. Что раньше, там и срез.
  const flat = Math.hypot(pose.up.x, pose.up.y);
  const toFloor = pose.up.h > 1e-3 ? pose.shoulders.h / pose.up.h : Infinity;
  const toRim = flat > 1e-3 ? Math.max(0, Math.hypot(pose.shoulders.x, pose.shoulders.y) - TABLE_EDGE) / flat : Infinity;
  const below = Math.max(0, Math.min(1, 1 - py - Math.min(toFloor, toRim, th) / th));
  // Голова: картинка карты смотрит в свою сторону — взгляд в другую сторону экрана зеркалит её.
  const looksRight = ahead.x > H.x;
  const flip = (art.looks < 0) === looksRight;
  const hw = DOLL_SIZE.head;
  const k = local(toGlass, pose.shoulders);
  const strained = body.stretch > NECK.free;
  const lineSvg = (a: Point, b: Point, w: number, color: string, extra = "") => `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${color}" stroke-width="${Math.max(1.5, w).toFixed(1)}" stroke-linecap="round"${extra}/>`;
  const base = toGlass(pose.shoulders, 0);
  const chin = at({ ...pose.head, h: pose.head.h - pose.headH * 0.35 });
  const svg = `<svg style="position:absolute;left:0;top:0;overflow:visible" width="1" height="1">`
    + (pose.away ? `<circle data-g="empty-seat" cx="${base.x.toFixed(1)}" cy="${base.y.toFixed(1)}" r="${(0.8 * local(toGlass, { ...pose.shoulders, h: 0 })).toFixed(1)}" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="5 4" opacity=".7"/>`
      + lineSvg(S, H, 2, ink, ` stroke-dasharray="3 5" opacity=".55" data-g="tether"`) : "")
    + (!pose.away && strained ? lineSvg(S, chin, 0.35 * k, T.black) + lineSvg(S, chin, 0.2 * k, T.danger) : "")
    + `</svg>`;
  // РУКИ-ХВАТЫ: нарисованы правой рукой; левая — отражённая. Правая — у пальца, с картой — на её высоте.
  const right: Point3 | null = body.right ? { ...body.right, h: holding ? HEAD.lift * pose.head.h : 0.4 } : null;
  const hand = (p: Point3, img: string, gname: string, mirror: boolean) => {
    const q = at(p), w = 1.5 * local(toGlass, p);
    return `<img data-g="${gname}" src="${sprite(img)}" alt="" draggable="false" style="position:absolute;left:${(q.x - w / 2).toFixed(1)}px;top:${(q.y - w / 2).toFixed(1)}px;width:${w.toFixed(1)}px;height:${w.toFixed(1)}px;pointer-events:none${mirror ? ";transform:scaleX(-1)" : ""}">`;
  };
  // ТАБЛИЧКА ИМЕНИ — над головой на экране: сверху «выше головы» в мире — та же точка, что лицо.
  const hk = local(toGlass, pose.head);
  const fs = Math.max(9, 0.55 * hk);
  const tag = `<span data-g="name" style="position:absolute;left:${H.x.toFixed(1)}px;top:${(H.y - pose.headH * 0.62 * hk - fs - 6).toFixed(1)}px;transform:translateX(-50%);white-space:nowrap;padding:1px 6px;border-radius:6px;`
    + `background:${T.black};box-shadow:inset 0 0 0 1.5px ${ink};font:400 ${fs.toFixed(0)}px Tiny5,monospace;color:${T.ink}">${esc(name)}</span>`;
  return `<div data-g="body" data-model="${doll}" data-palette="${palette}" data-by="${esc(body.by)}" data-name="${esc(name)}" data-stance="${body.stance}" data-yaw="${body.yaw}" data-stretch="${body.stretch.toFixed(2)}" data-away="${pose.away ? 1 : 0}" data-behind="${behind ? 1 : 0}" data-head-h="${pose.head.h.toFixed(2)}" style="position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:24">`
    + plane(torso, pose.shoulders, pose.up, tw, th, [0.5, py], false, "doll-body", below)
    + svg
    + plane(face, pose.head, pose.away ? pose.headUp : pose.up, hw, pose.headH, [0.5, 0.5], flip, "doll-head")
    + hand(pose.left, "hand-closed", "left-hand", !behind)
    + (right ? hand(right, holding ? "hand-closed" : "hand-open", "right-hand", behind) : "")
    + tag
    + `</div>`;
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
  return `<div data-g="body" data-model="avatar" data-by="${esc(body.by)}" data-name="${esc(name)}" data-stance="${body.stance}" data-yaw="${body.yaw}" data-stretch="${body.stretch.toFixed(2)}" data-away="${away ? 1 : 0}" data-head-h="${head.h.toFixed(2)}" style="position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:24">`
    + svg
    + hand(left, "hand-closed", "left-hand", true)
    + (right ? hand(right, holding ? "hand-closed" : "hand-open", "right-hand", false) : "")
    + `</div>`;
}
