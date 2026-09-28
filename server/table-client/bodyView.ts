// ЧУЖИЕ ТЕЛА НА СТОЛЕ — сверху, как стол виден веб-клиенту: плечи у стула (сидит — поменьше, стоит —
// крупнее, с тенью), шея к голове и правая рука — только когда она в деле. Саму голову (аватар с носом-
// взглядом) и карты в левой руке рисует сукно (`felt.ts`, `Seat.body`): они там же, где аватар и карты
// стула. Своё тело не рисуется: своя голова — это камера.
//
// Геометрия — общая (`src/table/bodies.ts`); здесь только вид. Спрайты придут картинками — места под них
// те же, что у этих временных фигур.

import type { Body } from "../src/table/bodies.js";
import { NECK, headOf, shouldersOf } from "../src/table/bodies.js";
import { DISC } from "./felt.js";

type Point = { x: number; y: number };

export interface BodyLook {
  body: Body;
  /** Угол стула владельца. */
  angle: number;
  ink: string;
  name: string;
}

export interface BodyColors {
  black: string;
  ink: string;
  danger: string;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Разметка тел: `toGlass` — точка стола на стекле, `k` — пикселей в единице стола. */
export function bodiesHtml(all: readonly BodyLook[], toGlass: (p: Point) => Point, k: number, T: BodyColors): string {
  return all.map((one) => bodyHtml(one, toGlass, k, T)).join("");
}

function bodyHtml({ body, angle, ink, name }: BodyLook, toGlass: (p: Point) => Point, k: number, T: BodyColors): string {
  const shoulders = shouldersOf(angle);
  const head = headOf(shoulders, body.look, body.stretch);
  const S = toGlass(shoulders), center = toGlass(head);
  // ШЕЯ ДОХОДИТ ДО КРОМКИ ГОЛОВЫ, а не до её середины: голова — аватар на сукне, шея не перечёркивает лицо.
  const len = Math.hypot(center.x - S.x, center.y - S.y) || 1;
  const cut = Math.min(len, (DISC / 2) * k);
  const H = { x: center.x - ((center.x - S.x) / len) * cut, y: center.y - ((center.y - S.y) / len) * cut };
  const standing = body.stance === "stand";
  const torso = k * (standing ? 1.9 : 1.5);
  // Шея натянута сильнее свободного — краснеет: видно, кто тянется и сколько ему ещё терпеть.
  const strained = body.stretch > NECK.free;
  const neckInk = strained ? T.danger : ink;
  const right = body.right ? toGlass(body.right) : null;
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
