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
import { HEAD, NECK, SHOULDERS, awayOf, gazeOf, headOf, leftHandOf, shoulders3, shouldersOf, type Point3 } from "../src/table/bodies.js";
import type { Doll } from "../src/table/dolls.js";
import { EXTEND, partGeom, partSprite, type DollSprite } from "./dollSprites.js";
import { AVATAR, VIEW_DIRS, drawnView, partOf, pickView, type Part, type Parts } from "../src/table/skins.js";
import { PIP_AT } from "./skinArt.js";
import { DISC, R, RIM, SEAT, TABLE_THICK } from "./felt.js";
import { seatPoint } from "../src/table/ring.js";
import { PALETTES } from "../src/table/dolls.js";

/** Краски расцветки для того, что слой тел рисует сам (очки кубика). */
const paletteColors = (k: number) => PALETTES[k] ?? PALETTES[0]!;

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
  /** Кем сидит: набор (`dolls.ts`), расцветка и сама сборка — части скина (`skins.ts`). */
  doll: Doll;
  palette: number;
  parts: Parts;
  /** Фото из Telegram — в голове-аватаре (`AVATAR`). */
  photo?: string;
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
  if (all.length === 0) return "";
  const behind = behindTable(toGlass);
  const eye = towardEye(toGlass, { x: 0, y: 0, h: 0 });
  // Сидит ближе к камере, чем середина стола, — рисуется перед столом; дальше — стол его перекрывает.
  const clipOf = (one: BodyLook) => (nearerThanTable(eye, shouldersOf(one.angle)) ? "" : behind);
  return all.map((one) => (dolls && dollHtml(one, toGlass, T, sprite, dolls, clipOf(one))) || avatarHtml(one, toGlass, T, sprite, clipOf(one))).join("");
}

/**
 * ТЕЛО ПЕРЕД СТОЛОМ ИЛИ ЗА НИМ — ближе ли его место к камере, чем середина стола: по направлению на глаз из середины
 * (`eye`, в осях стола). Сверху (глаз над серединой) все за столом; наклонил камеру — места с ближней стороны выходят
 * вперёд. Порог — чтобы при почти отвесном взгляде тела не прыгали туда-сюда.
 */
export function nearerThanTable(eye: Point3, seat: Point): boolean {
  const r = Math.hypot(seat.x, seat.y) || 1;
  return (eye.x * seat.x + eye.y * seat.y) / r > NEARER;
}
/** Во сколько горизонт взгляда (синус наклона) × косинус угла к месту должен быть больше, чтобы тело было впереди. */
const NEARER = 0.15;

/**
 * СТОЛ ПЕРЕКРЫВАЕТ ТЕЛА, ЧТО ЗА НИМ — тело за столом никогда не лежит поверх стола. Слой тел — над холстом, поэтому
 * всё, что от тела ниже головы (туловище, ноги, спинка стула, палка), обрезается по силуэту стола на экране: верх
 * столешницы с кромкой и её бок. Голова, причёска, обе руки и табличка имени видны ВСЕГДА. Тело перед столом (`nearerThanTable`) не обрезается. Отдаёт стиль `clip-path`.
 */
function behindTable(toGlass: ToGlass): string {
  const pts: Point[] = [];
  const edge = R + RIM;
  for (let i = 0; i < 96; i += 1) {
    const a = (i / 96) * Math.PI * 2, p = { x: Math.cos(a) * edge, y: Math.sin(a) * edge };
    pts.push(toGlass(p, 0), toGlass(p, -TABLE_THICK));
  }
  // Силуэт — выпуклая оболочка верха и низа столешницы (монотонная цепь).
  pts.sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  const hull = [...half(pts), ...half([...pts].reverse())];
  if (hull.length < 3 || hull.some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y))) return "";
  const B = 100000;
  const table = hull.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" ") + " Z";
  return `clip-path:path(evenodd,'M${-B} ${-B} H${B} V${B} H${-B} Z ${table}')`;
}

/** Обёртка того, что стол перекрывает. */
const underTable = (clip: string, html: string): string => (clip ? `<div data-g="behind-table" style="position:absolute;left:0;top:0;width:0;height:0;${clip}">${html}</div>` : html);

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
export function dollPose(body: Body, angle: number, parts: Parts, toGlass: ToGlass): DollPose {
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
  const headH = DOLL_SIZE.head * partGeom(parts.head).aspect;
  const lift = headH * 0.45 + 0.2;
  const dollHead = away ? head : { x: s.x + up.x * lift + head.x - rest.x, y: s.y + up.y * lift + head.y - rest.y, h: s.h + up.h * lift + head.h - rest.h };
  return { shoulders: s, head: dollHead, left: leftHandOf(dollHead, body.yaw), up, headUp, away, headH };
}

/** Спинка стула, в единицах стола: ниже плеч сидящего (плечи на 4) и на столько за ними. Ширина — по фигуре. */
export const CHAIR_BACK = { h: 3.7, behind: 0.7 };
const backs = new Map<string, { src: string; w: number; h: number }>();
/** Картинка спинки — дерево стула, обводка — свой цвет сидящего, как у арки на сукне. */
function chairBackOf(ink: string): { src: string; w: number; h: number } {
  let got = backs.get(ink);
  if (!got) {
    const w = 100, h = Math.round((100 * CHAIR_BACK.h) / 4.4);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
      + `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SEAT.woodHi}"/><stop offset="1" stop-color="${SEAT.woodLo}"/></linearGradient></defs>`
      + `<path d="M4 ${h} V22 Q4 4 22 4 H${w - 22} Q${w - 4} 4 ${w - 4} 22 V${h} Z" fill="url(#g)" stroke="${SEAT.black}" stroke-width="7"/>`
      + `<path d="M4 ${h} V22 Q4 4 22 4 H${w - 22} Q${w - 4} 4 ${w - 4} 22 V${h}" fill="none" stroke="${ink}" stroke-width="3.5"/>`
      + `<path d="M22 ${h} V30 M${w / 2} ${h} V30 M${w - 22} ${h} V30" stroke="${SEAT.black}" stroke-opacity=".35" stroke-width="3"/>`
      + `</svg>`;
    got = { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, w, h };
    backs.set(ink, got);
  }
  return got;
}

/**
 * ОТКУДА НА ТОЧКУ СМОТРЯТ — единичный вектор к глазу. Глаз стоит на луче: точка на единицу выше, которая
 * ложится в тот же пиксель, лежит на том же луче. Её ищем Ньютоном по проекции — так одинаково для камеры
 * пальцев и для AR, и никто не должен сообщать, где у него глаз.
 */
export function towardEye(toGlass: ToGlass, P: Point3): Point3 {
  const q = toGlass(P, P.h), h = P.h + 1, e = 0.05;
  let x = P.x, y = P.y;
  for (let i = 0; i < 5; i += 1) {
    const o = toGlass({ x, y }, h), ax = toGlass({ x: x + e, y }, h), ay = toGlass({ x, y: y + e }, h);
    const a = (ax.x - o.x) / e, b = (ay.x - o.x) / e, c = (ax.y - o.y) / e, d = (ay.y - o.y) / e;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-9) break;
    const fx = o.x - q.x, fy = o.y - q.y;
    x -= (d * fx - b * fy) / det;
    y -= (-c * fx + a * fy) / det;
  }
  const v = { x: x - P.x, y: y - P.y, h: 1 };
  const n = Math.hypot(v.x, v.y, v.h) || 1;
  return { x: v.x / n, y: v.y / n, h: v.h / n };
}

/** Вектор стола в оси фигуры, что смотрит по `f` (горизонтально): x — её правая рука, y — вперёд, z — вверх. */
const inFigure = (v: Point3, f: Point): [number, number, number] => [v.x * -f.y + v.y * f.x, v.x * f.x + v.y * f.y, v.h];

/** Какой ракурс показан у кого — держится на стыке двух, чтобы картинка не мигала (`VIEW_HOLD`). */
const shownView = new Map<string, string>();

/** Палка с кружком — стартовый скин (и свой аватар в кружке): её рисует прежний аватар (`avatarHtml`). */
export const isStick = (parts: Parts): boolean => parts.body === "stick:body";

/** Ноги стоящего: от пола до этой высоты, в единицах стола (плечи стоящего — на 7). */
const LEGS_H = 3.8;
/** Свет на кубике: сверху-спереди — верх светлее, бока темнее. */
const LIGHT = (() => { const v = { x: -0.4, y: 0.5, h: 0.9 }, n = Math.hypot(v.x, v.y, v.h); return { x: v.x / n, y: v.y / n, h: v.h / n }; })();

function dollHtml({ body, angle, ink, name, holding, doll, palette, parts, photo }: BodyLook, toGlass: ToGlass, T: BodyColors, sprite: (name: string) => string, src: DollSource, clip = ""): string | null {
  if (isStick(parts)) return null;
  const bodyPart = partOf(parts.body), headPart = partOf(parts.head);
  if (!bodyPart || !headPart) return null;
  const pose = dollPose(body, angle, parts, toGlass);
  const geom = partGeom(parts.body), headGeom = partGeom(parts.head);
  const at = (p: Point3): Point => toGlass(p, p.h);
  const S = at(pose.shoulders), H = at(pose.head);
  // РАКУРС — КАК В DOOM: откуда на часть смотрят, в её собственных осях, и ближайший нарисованный ракурс.
  // Туловище и ноги смотрят, куда стул (к середине стола), голова и причёска — куда человек.
  const r0 = Math.hypot(pose.shoulders.x, pose.shoulders.y) || 1;
  const inward = { x: -pose.shoulders.x / r0, y: -pose.shoulders.y / r0 };
  const g = gazeOf(body.yaw);
  const view = (slot: string, part: Part, P: Point3, f: Point) => {
    const key = `${body.by}|${slot}`;
    const v = pickView(part, inFigure(towardEye(toGlass, P), f), shownView.get(key));
    shownView.set(key, v);
    return v;
  };
  const standing = body.stance === "stand";
  const bodyView = view("body", bodyPart, pose.shoulders, inward), headView = view("head", headPart, pose.head, g);
  const behind = bodyView === "back" || bodyView === "a180";
  const bodyDrawn = drawnView(bodyPart, bodyView), headDrawn = drawnView(headPart, headView);
  const torso = partSprite(bodyPart.id, palette, bodyDrawn.view, ink, src.base, src.ready);
  const face = headPart.facing === "box" ? ({ src: "", w: 1, h: 1, solid: 1 } as DollSprite) : partSprite(headPart.id, palette, headDrawn.view, ink, src.base, src.ready);
  if (!torso || !face) return null;
  const ahead = at({ x: pose.head.x + g.x, y: pose.head.y + g.y, h: pose.head.h });
  /** Картинка на плоскости: верх — мировой вектор `up` в точке `P`, ширина — поперёк него на экране. */
  const plane = (img: { src: string; w: number; h: number }, P: Point3, up: Point3, w: number, h: number, pivot: [number, number], mirror: boolean, g: string, clipBottom = 0, across?: Point3) => {
    const k = local(toGlass, P);
    const o = at(P), t = at({ x: P.x + up.x, y: P.y + up.y, h: P.h + up.h });
    const ay = { x: t.x - o.x, y: t.y - o.y };
    const len = Math.hypot(ay.x, ay.y) || 1;
    // ПОПЕРЁК — настоящее направление в мире (плоскость повёрнута к своему ракурсу, и сбоку она сужается), или —
    // без него — просто поперёк экрана.
    const side = across ? at({ x: P.x + across.x, y: P.y + across.y, h: P.h + across.h }) : null;
    const m0 = mirror ? -1 : 1;
    const ax = side ? { x: (side.x - o.x) * m0, y: (side.y - o.y) * m0 } : { x: (-ay.y / len) * k * m0, y: (ay.x / len) * k * m0 };
    const tl = { x: o.x - ax.x * w * pivot[0] + ay.x * h * pivot[1], y: o.y - ax.y * w * pivot[0] + ay.y * h * pivot[1] };
    const m = [(ax.x * w) / img.w, (ax.y * w) / img.w, (-ay.x * h) / img.h, (-ay.y * h) / img.h, tl.x, tl.y].map((v) => v.toFixed(4)).join(",");
    return `<img data-g="${g}" src="${img.src}" alt="" draggable="false" style="position:absolute;left:0;top:0;width:${img.w}px;height:${img.h}px;transform-origin:0 0;transform:matrix(${m});pointer-events:none${clipBottom > 0 ? `;clip-path:inset(0 0 ${(clipBottom * 100).toFixed(1)}% 0)` : ""}">`;
  };
  /** Направление ракурса `name` части, что смотрит по `f`, — в осях стола (горизонтально). */
  const viewDir = (name: string, f: Point): Point => {
    const d = VIEW_DIRS[name] ?? VIEW_DIRS.front!, R = { x: -f.y, y: f.x };
    return { x: R.x * d[0] + f.x * d[1], y: R.y * d[0] + f.y * d[1] };
  };
  /**
   * КАК ЧАСТЬ СТОИТ К КАМЕРЕ (`Part.facing`) → поперёк плоскости и во сколько она сужена:
   *   view   — поперёк по ракурсу: плоскость повёрнута к нему, под углом сужается сама;
   *   tilt   — бумажный спрайт: лицом в камеру, а по ширине сужается по углу между ракурсом и взглядом;
   *   camera — лицом в камеру, как есть.
   */
  const facingOf = (part: Part, name: string, f: Point, P: Point3): { across?: Point3; squeeze: number; flat?: Point3 } => {
    // ВИД СВЕРХУ ИЛИ СНИЗУ — часть лежит плашмя: верх картинки — от стола (−вперёд), поперёк — в осях фигуры
    // (как на сцене профиля, `skinStage.ts`). Стоймя поперёк стула её у боковых мест видно ребром.
    const vz = VIEW_DIRS[name]?.[2] ?? 0;
    if (part.facing === "view" && Math.abs(vz) > 0.9) {
      const R = { x: -f.y, y: f.x };
      const side = vz > 0 ? -1 : 1;
      return { flat: { x: -f.x, y: -f.y, h: 0 }, across: { x: R.x * side, y: R.y * side, h: 0 }, squeeze: 1 };
    }
    if (part.facing === "view") {
      const dw = viewDir(name, f), n = Math.hypot(dw.x, dw.y);
      const R = { x: -f.y, y: f.x };
      return { across: n < 1e-6 ? { x: R.x, y: R.y, h: 0 } : { x: dw.y / n, y: -dw.x / n, h: 0 }, squeeze: 1 };
    }
    if (part.facing !== "tilt") return { squeeze: 1 };
    const e = towardEye(toGlass, P), lean = Math.hypot(e.x, e.y);
    if (lean < 1e-3) return { squeeze: 1 };
    const dw = viewDir(name, f), n = Math.hypot(dw.x, dw.y) || 1;
    return { squeeze: Math.max(0.12, Math.abs((dw.x * e.x + dw.y * e.y) / (n * lean)) * lean + (1 - lean)) };
  };
  // СПИНКА СТУЛА — ЗА СПИНОЙ сидящего: чуть дальше от стола, чем его плечи, по ширине его туловища и ниже плеч.
  // Со стороны стола её не видно (закрыта фигурой), со спины она закрывает спину. Стоит честно вертикально: сверху
  // сходит в полоску.
  const backAt = { ...seatPoint(angle, SHOULDERS + CHAIR_BACK.behind), h: 0 };
  const rise = Math.hypot(at({ ...backAt, h: 1 }).x - at(backAt).x, at({ ...backAt, h: 1 }).y - at(backAt).y) / (local(toGlass, backAt) || 1);
  const backW = Math.max(2.4, DOLL_SIZE.torso * torso.solid * 0.92);
  const chairBack = rise > 0.12 ? plane(chairBackOf(ink), backAt, { x: 0, y: 0, h: 1 }, backW, CHAIR_BACK.h, [0.5, 1], false, "chair-back", 0, { x: -inward.y, y: inward.x, h: 0 }) : "";
  // ТУЛОВИЩЕ СТОИТ ЗА СТОЛОМ: линия плеч — на высоте плеч; ниже уровня стола (стоя — ниже пояса, там ноги) срезано.
  const bodyFace = facingOf(bodyPart, bodyView, inward, pose.shoulders);
  const tw = DOLL_SIZE.torso * bodyFace.squeeze, th = ((DOLL_SIZE.torso * torso.h) / torso.w) * DOLL_SIZE.stretch;
  const py = geom.shoulder;
  // Видно от плеч вниз, пока туловище не ушло под стол: ниже уровня сукна (стоя — пояса) — или (сверху, когда
  // кукла лежит за кромкой) за край стола. Что раньше, там и срез.
  const floor = standing ? LEGS_H * 0.92 : 0;
  const flat = Math.hypot(pose.up.x, pose.up.y);
  const toFloor = pose.up.h > 1e-3 ? (pose.shoulders.h - floor) / pose.up.h : Infinity;
  const toRim = flat > 1e-3 ? Math.max(0, Math.hypot(pose.shoulders.x, pose.shoulders.y) - TABLE_EDGE) / flat : Infinity;
  const below = Math.max(0, Math.min(1, 1 - py - Math.min(toFloor, toRim, th) / th));
  // НОГИ — только стоя: от пола до пояса, под плечами.
  let legs = "";
  const legsPart = partOf(parts.legs);
  if (standing && legsPart && legsPart.art.kind !== "none") {
    const P = { x: pose.shoulders.x, y: pose.shoulders.y, h: 0 };
    const lv = view("legs", legsPart, { ...P, h: LEGS_H / 2 }, inward), ld = drawnView(legsPart, lv);
    const img = partSprite(legsPart.id, palette, ld.view, ink, src.base, src.ready);
    const lf = facingOf(legsPart, lv, inward, { ...P, h: LEGS_H / 2 });
    if (img) legs = plane(img, P, pose.up, 3.4 * lf.squeeze, LEGS_H, [0.5, 1], ld.mirror, "doll-legs", 0, lf.across);
  }
  // Голова: лицо, нарисованное вполоборота (фигуры колоды), смотрит в свою сторону — взгляд в другую сторону
  // экрана зеркалит его. Боковой ракурс зеркалится, только если он взят отражением (левый из правого).
  const looksRight = ahead.x > H.x;
  const turnedFace = headGeom.looks !== 0 && (headDrawn.view === "front" || headDrawn.view === "back");
  const flip = turnedFace ? (headGeom.looks < 0) === looksRight : headDrawn.mirror;
  const headUp = pose.away ? pose.headUp : pose.up;
  const headFace = facingOf(headPart, headView, g, pose.head);
  const hw = DOLL_SIZE.head;
  const head = headPart.facing === "box" ? cubeSvg(pose.head, hw * 0.9, g, palette) : plane(face, pose.head, headFace.flat ?? headUp, hw * headFace.squeeze, pose.headH, [0.5, 0.5], flip, "doll-head", 0, headFace.across);
  // ГОЛОВА-АВАТАР: шар, а в нём — фото человека, кружком поверх.
  const photoD = hw * 0.74 * local(toGlass, pose.head);
  const avatar = parts.head === AVATAR && photo
    ? `<img data-g="doll-photo" src="${esc(photo)}" alt="" draggable="false" style="position:absolute;left:${(H.x - photoD / 2).toFixed(1)}px;top:${(H.y - photoD / 2).toFixed(1)}px;width:${photoD.toFixed(1)}px;height:${photoD.toFixed(1)}px;border-radius:50%;object-fit:cover;pointer-events:none">`
    : "";
  // ПРИЧЁСКА — на макушке, в осях головы.
  let hair = "";
  const hairPart = partOf(parts.hair);
  if (hairPart && hairPart.art.kind !== "none") {
    const P = { x: pose.head.x + headUp.x * pose.headH * 0.55, y: pose.head.y + headUp.y * pose.headH * 0.55, h: pose.head.h + headUp.h * pose.headH * 0.55 };
    const hv = view("hair", hairPart, P, g), hd = drawnView(hairPart, hv);
    const img = partSprite(hairPart.id, palette, hd.view, ink, src.base, src.ready);
    const hf = facingOf(hairPart, hv, g, P);
    if (img) hair = plane(img, P, headUp, hw * 1.05 * hf.squeeze, hw * 1.05, [0.5, 0.75], hd.mirror, "doll-hair", 0, hf.across);
  }
  /** КУБИК-ГОЛОВА — настоящая коробка: грани, что смотрят на камеру, в проекции; очки — кругами на гранях. */
  function cubeSvg(C: Point3, size: number, f: Point, pal: number): string {
    const R = { x: -f.y, y: f.x, h: 0 }, F = { x: f.x, y: f.y, h: 0 }, Z = { x: 0, y: 0, h: 1 };
    const add = (a: Point3, b: Point3, k = 1): Point3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, h: a.h + b.h * k });
    const neg = (a: Point3): Point3 => ({ x: -a.x, y: -a.y, h: -a.h });
    const eye = towardEye(toGlass, C);
    const colors = paletteColors(pal);
    const faces: [string, Point3, Point3][] = [["front", F, Z], ["back", neg(F), Z], ["right", R, Z], ["left", neg(R), Z], ["top", Z, neg(F)], ["bottom", neg(Z), neg(F)]];
    let out = "";
    const drawn: { d: number; svg: string }[] = [];
    for (const [nameF, n, up] of faces) {
      if (n.x * eye.x + n.y * eye.y + n.h * eye.h <= 0) continue;
      // поперёк — правая рука того, кто смотрит на грань прямо
      const across = { x: up.y * n.h - up.h * n.y, y: up.h * n.x - up.x * n.h, h: up.x * n.y - up.y * n.x };
      const c = add(C, n, size / 2);
      const P = (u: number, v: number) => at(add(add(c, across, (u - 0.5) * size), up, (0.5 - v) * size));
      const corners = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
      const pts = (list: Point[]) => list.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ");
      const light = Math.max(0, n.x * LIGHT.x + n.y * LIGHT.y + n.h * LIGHT.h), dark = (0.55 * (1 - light)).toFixed(2);
      let svg = `<polygon points="${pts(corners)}" fill="#f7f1e6"/>`;
      for (const [pu, pv] of PIP_AT[nameF] ?? []) svg += `<polygon points="${pts(Array.from({ length: 14 }, (_, k) => { const t = (k / 14) * Math.PI * 2; return P(pu + Math.cos(t) * 0.085, pv + Math.sin(t) * 0.085); }))}" fill="${colors.red}"/>`;
      svg += `<polygon points="${pts(corners)}" fill="rgba(28,20,14,${dark})" stroke="${T.black}" stroke-width="2.5" stroke-linejoin="round"/>`;
      drawn.push({ d: -(n.x * eye.x + n.y * eye.y + n.h * eye.h), svg });
    }
    drawn.sort((a, b) => b.d - a.d);
    for (const one of drawn) out += one.svg;
    return `<svg data-g="doll-head" data-cube="1" style="position:absolute;left:0;top:0;overflow:visible" width="1" height="1">${out}</svg>`;
  }
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
  const lift = hair ? 0.95 : headPart.facing === "box" ? 1.1 : 0.62;
  const tag = `<span data-g="name" style="position:absolute;left:${H.x.toFixed(1)}px;top:${(H.y - pose.headH * lift * hk - fs - 6).toFixed(1)}px;transform:translateX(-50%);white-space:nowrap;padding:1px 6px;border-radius:6px;`
    + `background:${T.black};box-shadow:inset 0 0 0 1.5px ${ink};font:400 ${fs.toFixed(0)}px Tiny5,monospace;color:${T.ink}">${esc(name)}</span>`;
  return `<div data-g="body" data-model="${esc(doll)}" data-parts="${esc(Object.values(parts).join(" "))}" data-palette="${palette}" data-by="${esc(body.by)}" data-name="${esc(name)}" data-stance="${body.stance}" data-yaw="${body.yaw}" data-stretch="${body.stretch.toFixed(2)}" data-away="${pose.away ? 1 : 0}" data-behind="${behind ? 1 : 0}" data-view="${bodyView}" data-head-view="${headView}" data-head-h="${pose.head.h.toFixed(2)}" style="position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:24">`
    + underTable(clip, (behind ? "" : chairBack)
    + legs
    + (bodyFace.flat
      // плашмя — серединой нарисованного (ниже него пустое место, `EXTEND`) на плечах, без среза
      ? plane(torso, pose.shoulders, bodyFace.flat, tw, th / DOLL_SIZE.stretch, [0.5, 0.5 / (1 + EXTEND)], bodyDrawn.mirror, "doll-body", 0, bodyFace.across)
      : plane(torso, pose.shoulders, pose.up, tw, th, [0.5, py], bodyDrawn.mirror, "doll-body", below, bodyFace.across))
    + (behind ? chairBack : "")
    + svg)
    + head
    + avatar
    + hair
    + hand(pose.left, "hand-closed", "left-hand", !behind)
    + (right ? hand(right, holding ? "hand-closed" : "hand-open", "right-hand", behind) : "")
    + tag
    + `</div>`;
}

function avatarHtml({ body, angle, ink, name, holding }: BodyLook, toGlass: ToGlass, T: BodyColors, sprite: (name: string) => string, clip = ""): string {
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
    + underTable(clip, svg)
    + hand(left, "hand-closed", "left-hand", true)
    + (right ? hand(right, holding ? "hand-closed" : "hand-open", "right-hand", false) : "")
    + `</div>`;
}
