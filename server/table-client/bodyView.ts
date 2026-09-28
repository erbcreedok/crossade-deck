// ЧУЖИЕ ТЕЛА НА СТОЛЕ — сверху, как стол виден веб-клиенту: плечи у стула (сидит — поменьше, стоит —
// крупнее, с тенью), шея к голове и правая рука — только когда она в деле. Саму голову (аватар с носом-
// взглядом) и карты в левой руке рисует сукно (`felt.ts`, `Seat.body`): они там же, где аватар и карты
// стула. Своё тело не рисуется: своя голова — это камера.
//
// Геометрия — общая (`src/table/bodies.ts`); здесь только вид. Спрайты придут картинками — места под них
// те же, что у этих временных фигур.

import type { Body } from "../src/table/bodies.js";
import { NECK, headOf, leftHandOf, shoulders3, type Point3 } from "../src/table/bodies.js";
import { DISC } from "./felt.js";

type Point = { x: number; y: number };
/** Точка стола на стекле — с высотой над сукном. */
type ToGlass = (p: Point, h?: number) => Point;
const up = (toGlass: ToGlass, p: Point3): Point => toGlass(p, p.h);

export interface BodyLook {
  body: Body;
  /** Угол стула владельца. */
  angle: number;
  ink: string;
  name: string;
  /** Несёт карту — правая рука сжата. */
  holding?: boolean;
}

export interface BodyColors {
  black: string;
  ink: string;
  danger: string;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Разметка тел: `toGlass` — точка стола на стекле, `k` — пикселей в единице стола. */
export function bodiesHtml(all: readonly BodyLook[], toGlass: ToGlass, k: number, T: BodyColors, sprite: (name: string) => string): string {
  return all.map((one) => (one.body.model === "king" ? kingHtml(one, toGlass, k, T, sprite) : bodyHtml(one, toGlass, k, T))).join("");
}

/**
 * ВИД «КОРОЛЬ» — спрайты стоят, а не лежат (лицом к смотрящему, как кружок-аватар): туловище короля треф
 * у плеч, шея, его голова там, где голова, табличка с именем под ней, руки-хваты. Левая держит карты —
 * сами карты рисует сукно под ней; правая открыта у курсора и сжата, когда несёт карту.
 */
function kingHtml({ body, angle, ink, name, holding }: BodyLook, toGlass: ToGlass, k: number, T: BodyColors, sprite: (name: string) => string): string {
  const shoulders = shoulders3(angle, body.stance);
  const head = headOf(shoulders, body.eye, body.stretch);
  const S = up(toGlass, shoulders), H = up(toGlass, head), L = up(toGlass, leftHandOf(head, body.yaw));
  const standing = body.stance === "stand";
  // ТУЛОВИЩЕ СТОИТ ЗА СТОЛОМ: низ — на уровне стола у кромки, линия плеч (верхняя пятая часть спрайта) — на
  // высоте плеч. Стоя плечи выше — и туловище выше от того же низа. Сверху высоты не видно — тогда оно
  // хотя бы своего размера, а не исчезает.
  const base = toGlass(shoulders, 0);
  const rise = Math.hypot(S.x - base.x, S.y - base.y);
  const bodyH = Math.max(rise / 0.8, k * (standing ? 2.7 : 2.2));
  const bodyW = bodyH * (123 / 92);
  const bodyTop = { x: S.x, y: S.y - bodyH * 0.2 };
  // Голова и руки — в пропорции к туловищу, как на самой карте: вырос — выросли и они.
  const headW = bodyW * 0.5, headH = headW * (58 / 70);
  const handW = bodyW * 0.28;
  const strained = body.stretch > NECK.free;
  const img = (src: string, x: number, y: number, w: number, h: number, g: string, extra = "") =>
    `<img data-g="${g}" src="${src}" alt="" draggable="false" style="position:absolute;left:${(x - w / 2).toFixed(1)}px;top:${(y - h / 2).toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;pointer-events:none;${extra}">`;
  // Правая рука — у пальца, чуть над сукном: она держит карту, а не лежит на столе.
  const right = body.right ? toGlass(body.right, 0.4) : null;
  return `<div data-g="body" data-model="king" data-by="${esc(body.by)}" data-name="${esc(name)}" data-stance="${body.stance}" data-stretch="${body.stretch.toFixed(2)}" style="position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:24">`
    + img(sprite("king-body"), bodyTop.x, bodyTop.y + bodyH / 2, bodyW, bodyH, "king-body", standing ? `filter:drop-shadow(0 ${k * 0.3}px 0 rgba(11,7,4,.45))` : "")
    + `<svg style="position:absolute;left:0;top:0;overflow:visible" width="1" height="1"><line x1="${S.x}" y1="${S.y}" x2="${H.x}" y2="${H.y + headH * 0.3}" stroke="${strained ? T.danger : T.black}" stroke-width="${Math.max(4, k * 0.35)}" stroke-linecap="round"/></svg>`
    + img(sprite("king-head"), H.x, H.y, headW, headH, "head")
    + `<span style="position:absolute;left:${H.x.toFixed(1)}px;top:${(H.y + headH / 2 + 2).toFixed(1)}px;transform:translateX(-50%);white-space:nowrap;padding:1px 6px;border-radius:6px;`
    + `background:${T.black};box-shadow:inset 0 0 0 1.5px ${ink};font:400 ${Math.max(9, k * 0.42).toFixed(0)}px Tiny5,monospace;color:${T.ink}">${esc(name)}</span>`
    + img(sprite("hand-closed"), L.x, L.y + k * 0.5, handW, handW, "left-hand")
    + (right ? img(sprite(holding ? "hand-closed" : "hand-open"), right.x, right.y, handW, handW, "right-hand") : "")
    + `</div>`;
}

function bodyHtml({ body, angle, ink, name }: BodyLook, toGlass: ToGlass, k: number, T: BodyColors): string {
  const shoulders = shoulders3(angle, body.stance);
  const head = headOf(shoulders, body.eye, body.stretch);
  const S = up(toGlass, shoulders), center = up(toGlass, head);
  // ШЕЯ ДОХОДИТ ДО КРОМКИ ГОЛОВЫ, а не до её середины: голова — аватар на сукне, шея не перечёркивает лицо.
  const len = Math.hypot(center.x - S.x, center.y - S.y) || 1;
  const cut = Math.min(len, (DISC / 2) * k);
  const H = { x: center.x - ((center.x - S.x) / len) * cut, y: center.y - ((center.y - S.y) / len) * cut };
  const standing = body.stance === "stand";
  const torso = k * (standing ? 1.9 : 1.5);
  // Шея натянута сильнее свободного — краснеет: видно, кто тянется и сколько ему ещё терпеть.
  const strained = body.stretch > NECK.free;
  const neckInk = strained ? T.danger : ink;
  // Правая рука — у пальца, чуть над сукном: она держит карту, а не лежит на столе.
  const right = body.right ? toGlass(body.right, 0.4) : null;
  const svg = `<svg data-g="body" data-by="${esc(body.by)}" data-name="${esc(name)}" data-stance="${body.stance}" data-stretch="${body.stretch.toFixed(2)}" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:24" width="1" height="1">`
    // Тело — овал плеч; стоя — крупнее и с тенью под ногами.
    + (standing ? `<ellipse cx="${S.x}" cy="${S.y}" rx="${torso * 0.62}" ry="${torso * 0.42}" fill="${T.black}" opacity=".35"/>` : "")
    + `<ellipse cx="${S.x}" cy="${S.y}" rx="${torso / 2}" ry="${torso * 0.32}" fill="${ink}" stroke="${T.black}" stroke-width="2.5"/>`
    // Шея.
    + `<line x1="${S.x}" y1="${S.y}" x2="${H.x}" y2="${H.y}" stroke="${T.black}" stroke-width="${Math.max(4, k * 0.34)}" stroke-linecap="round"/>`
    + `<line x1="${S.x}" y1="${S.y}" x2="${H.x}" y2="${H.y}" stroke="${neckInk}" stroke-width="${Math.max(2, k * 0.2)}" stroke-linecap="round"/>`
    // Правая рука — от плеч к пальцу, только в деле.
    + (right
      ? `<line x1="${S.x}" y1="${S.y}" x2="${right.x}" y2="${right.y}" stroke="${ink}" stroke-width="${Math.max(2, k * 0.14)}" stroke-dasharray="${k * 0.3} ${k * 0.2}" opacity=".7"/>`
        + `<circle data-g="right-hand" cx="${right.x}" cy="${right.y}" r="${Math.max(6, k * 0.32)}" fill="${ink}" stroke="${T.black}" stroke-width="2.5"/>`
      : "")
    + `</svg>`;
  return svg;
}
