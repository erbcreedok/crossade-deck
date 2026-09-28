// ЧУЖИЕ ТЕЛА НА СТОЛЕ — сверху, как стол виден веб-клиенту: тело у стула (сидит — поменьше, стоит —
// крупнее и дальше от кромки видно плечи), шея к голове, голова-колобок с буквой имени, левая рука со
// стопкой карт у головы и правая — только когда она в деле. Своё тело не рисуется: своя голова — это камера.
//
// Геометрия — общая (`src/table/bodies.ts`); здесь только вид. Спрайты придут картинками — места под них
// те же, что у этих временных фигур.

import type { Body } from "../src/table/bodies.js";
import { NECK, headOf, leftHandOf, shouldersOf } from "../src/table/bodies.js";
import { SEAT_RADIUS, seatPoint } from "../src/table/ring.js";

/** Ближе этого к кружку стула голова не рисуется отдельно: кружок стула с буквой и есть голова в покое. */
const HEAD_AT_SEAT = 0.7;

type Point = { x: number; y: number };

export interface BodyLook {
  body: Body;
  /** Угол стула владельца. */
  angle: number;
  ink: string;
  name: string;
  /** Сколько карт в его руке. */
  cards: number;
}

export interface BodyColors {
  black: string;
  ink: string;
  danger: string;
  paper: string;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Разметка тел: `toGlass` — точка стола на стекле, `k` — пикселей в единице стола. */
export function bodiesHtml(all: readonly BodyLook[], toGlass: (p: Point) => Point, k: number, T: BodyColors): string {
  return all.map((one) => bodyHtml(one, toGlass, k, T)).join("");
}

function bodyHtml({ body, angle, ink, name, cards }: BodyLook, toGlass: (p: Point) => Point, k: number, T: BodyColors): string {
  const shoulders = shouldersOf(angle);
  const head = headOf(shoulders, body.look, body.stretch);
  const left = leftHandOf(shoulders, head);
  const S = toGlass(shoulders), H = toGlass(head), L = toGlass(left);
  const standing = body.stance === "stand";
  const torso = k * (standing ? 1.9 : 1.5);
  const headR = k * 0.55;
  // Шея натянута сильнее свободного — краснеет: видно, кто тянется и сколько ему ещё терпеть.
  const strained = body.stretch > NECK.free;
  const neckInk = strained ? T.danger : ink;
  const right = body.right ? toGlass(body.right) : null;
  const letter = esc([...name][0] ?? "?");
  const seat = seatPoint(angle, SEAT_RADIUS);
  const away = Math.hypot(head.x - seat.x, head.y - seat.y) > HEAD_AT_SEAT;
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
    // Левая рука со стопкой: карточки рубашкой и число.
    + (cards > 0
      ? `<g data-g="left-hand">`
        + [2, 1, 0].map((i) => `<rect x="${L.x - k * 0.32 + i * 2}" y="${L.y - k * 0.45 - i * 2}" width="${k * 0.64}" height="${k * 0.9}" rx="${k * 0.08}" fill="${T.paper}" stroke="${T.black}" stroke-width="1.5"/>`).join("")
        + `<text x="${L.x + 2}" y="${L.y + k * 0.1}" text-anchor="middle" font-family="Tiny5,monospace" font-size="${Math.max(9, k * 0.4)}" fill="${T.black}">${cards}</text></g>`
      : "")
    // Голова-колобок с буквой — когда отошла от стула; в покое голова — кружок самого стула.
    + (away
      ? `<circle data-g="head" cx="${H.x}" cy="${H.y}" r="${headR}" fill="${ink}" stroke="${T.black}" stroke-width="3"/>`
        + `<text x="${H.x}" y="${H.y + headR * 0.35}" text-anchor="middle" font-family="Tiny5,monospace" font-size="${Math.max(10, headR)}" fill="${T.black}">${letter}</text>`
      : "")
    + `</svg>`;
  return svg;
}
