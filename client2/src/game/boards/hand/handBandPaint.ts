// КРАСКА ПОЛОСЫ РУКИ (дропзоны) — ОДИН стиль владельца для руки в любом placement: rest — тихий
// сплошной контур, armed (груз в полёте где-то) — серый пунктир, hot (груз над рукой) — акцент.
// Фон всегда слабый. Рисуют ею и экранный док (handHud), и рука-на-борде (decor/gesture) — стиль
// не должен расходиться между «прибита к экрану» и «лежит на столе».

import type { Graphics } from "pixi.js";

const BG = 0x1a241e;

export type HandBandState = "rest" | "armed" | "hot";

export interface BandRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function paintHandBand(g: Graphics, b: BandRect, state: HandBandState, accent: number): void {
  g.roundRect(b.x, b.y, b.w, b.h, 12).fill({ color: BG, alpha: 0.14 });
  if (state === "armed") {
    dashedRoundRect(g, b.x, b.y, b.w, b.h, 12);
    g.stroke({ width: 2, color: 0x9aa79c, alpha: 0.95 });
    return;
  }
  const hot = state === "hot";
  g.roundRect(b.x, b.y, b.w, b.h, 12).stroke({ width: hot ? 3 : 1.5, color: hot ? accent : 0x5f7a6d, alpha: hot ? 1 : 0.3 });
}

/** Пунктирная обводка скруглённого прямоугольника: прямые рёбра штрихами, углы — сплошными дугами.
 *  Путь копится в g; вызвать g.stroke() после. Pixi v8 dash-паттерна не имеет — рисуем сегментами. */
function dashedRoundRect(g: Graphics, x: number, y: number, w: number, h: number, r: number, dash = 9, gap = 7): void {
  const x2 = x + w;
  const y2 = y + h;
  dashLine(g, x + r, y, x2 - r, y, dash, gap);
  dashLine(g, x2, y + r, x2, y2 - r, dash, gap);
  dashLine(g, x2 - r, y2, x + r, y2, dash, gap);
  dashLine(g, x, y2 - r, x, y + r, dash, gap);
  g.moveTo(x2 - r, y).arc(x2 - r, y + r, r, -Math.PI / 2, 0);
  g.moveTo(x2, y2 - r).arc(x2 - r, y2 - r, r, 0, Math.PI / 2);
  g.moveTo(x + r, y2).arc(x + r, y2 - r, r, Math.PI / 2, Math.PI);
  g.moveTo(x, y + r).arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
}

function dashLine(g: Graphics, x1: number, y1: number, x2: number, y2: number, dash: number, gap: number): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const ux = dx / len;
  const uy = dy / len;
  for (let t = 0; t < len; t += dash + gap) {
    const t2 = Math.min(t + dash, len);
    g.moveTo(x1 + ux * t, y1 + uy * t).lineTo(x1 + ux * t2, y1 + uy * t2);
  }
}
