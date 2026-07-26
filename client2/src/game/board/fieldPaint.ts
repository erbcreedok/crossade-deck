import { Container, Graphics, Text } from "pixi.js";
import { type FlowGeom } from "./dynamicGrid";
import type { FieldDecor, FieldDrag, Rect4 } from "./field";

// PAINT Поля — вся Pixi-графика «декора» (рамки/фон/якорь-узел/глаголы). Отделено от МЕХАНИКИ (field.ts
// держит порядок/дроп через дерево слотов): рисование — своя ответственность, свой файл. Field.draw
// лишь собирает геометрию/состояние и зовёт paintFieldDecor; сам ничего не чертит.

export interface FieldPaintDeps {
  frame: Graphics; // куда рисуем рамки/фон/узел
  anchor: Text; // текст якоря
  verb: Text; // глагол дропзоны (переселяется между слоями)
  layerBelow: Container; // «наведи» — под картами
  layerAbove: Container; // «брось» — над картами
  decor: FieldDecor | null; // null → голый грид (ничего не рисуем)
  dragState: FieldDrag;
  gridRect: Rect4; // рамка/фон дропзоны
  outerRect: Rect4; // внешняя рамка Поля
  gridEmpty: boolean; // пустой ли грид (для показа якоря)
  grid: FlowGeom; // геометрия ячейки/origin (для узла-якоря)
  stackRect: Rect4; // область колоды (начало узла-якоря)
}

/** Нарисовать «декор»: в ПОКОЕ бордеров нет (только узел-якорь на пустом гриде). При драге — внешняя
 *  рамка Поля + грид-дропзона (вне зоны dashed, над зоной solid + фон) + глагол «наведи»/«брось». */
export function paintFieldDecor(d: FieldPaintDeps): void {
  d.frame.clear();
  const decor = d.decor;
  if (!decor) {
    d.anchor.visible = false;
    d.verb.visible = false;
    return;
  }
  const gr = d.gridRect;
  const col = decor.colors;
  if (d.dragState !== "idle") {
    if (decor.outerBorder) dashRect(d.frame, d.outerRect, 11, 7, col.line, 2, 1, 12); // рамка Поля на драге
    if (decor.dropzoneBorder) {
      if (d.dragState === "hover") d.frame.roundRect(gr.x, gr.y, gr.w, gr.h, 8).fill({ color: col.fill, alpha: 0.16 }).stroke({ width: 2.5, color: col.hover }); // над зоной — solid + фон
      else dashRect(d.frame, gr, 9, 6, col.line, 1.5, 1, 8); // драг вне зоны — dashed (тот же радиус, что у solid)
    }
  }

  // Узел-якорь — только в покое, на пустом гриде и если задан текст.
  const idleEmpty = d.dragState === "idle" && d.gridEmpty && decor.anchorText !== null;
  d.anchor.visible = idleEmpty;
  if (idleEmpty) {
    d.anchor.text = decor.anchorText!;
    const cell = d.grid.cell;
    const first = { x: d.grid.origin.x + cell.w / 2, y: d.grid.origin.y + cell.h / 2 };
    const from = { x: d.stackRect.x + d.stackRect.w + 6, y: d.stackRect.y + 4 };
    const to = { x: first.x - cell.w * 0.32, y: first.y };
    drawKnot(d.frame, from, to, col.anchor, 1.5);
    d.anchor.position.set((from.x + to.x) / 2 + 6, Math.min(from.y, to.y) - 30);
  }

  // Глагол дропзоны: «наведи» (драг) — ПОД картами; «брось» (ховер) — НАД картами.
  const showVerb = d.dragState !== "idle";
  d.verb.visible = showVerb;
  if (showVerb) {
    const over = d.dragState === "hover";
    d.verb.text = over ? decor.verbHover : decor.verbDrag;
    d.verb.style.fill = over ? col.verbHover : col.verbDrag;
    d.verb.style.fontSize = over ? 20 : 16;
    // «брось» лежит ПОВЕРХ карт — без обводки/тени сливается с лицами. «наведи» под картами — тихий.
    d.verb.style.stroke = over ? { color: 0x14201b, width: 4 } : { color: 0, width: 0 };
    d.verb.style.dropShadow = over ? { color: 0x000000, alpha: 0.55, blur: 5, distance: 0, angle: 0 } : false;
    d.verb.position.set(gr.x + gr.w / 2, gr.y + gr.h / 2);
    (over ? d.layerAbove : d.layerBelow).addChild(d.verb);
  }
}

// ——— примитивы «декора» (dashed-рамка + узел-стрелка) ———

// Пройтись пунктиром по ломаной (замкнутой): узор dash/gap НЕПРЕРЫВЕН через углы (carry переносит
// фазу в следующий сегмент), поэтому скруглённые углы выходят ровными, а не «рвутся» на стыках.
function dashPath(g: Graphics, pts: Array<{ x: number; y: number }>, dash: number, gap: number, color: number, width: number, alpha: number): void {
  const seg = dash + gap;
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    let d = 0;
    while (d < len) {
      const patPos = (carry + d) % seg;
      if (patPos < dash) {
        const draw = Math.min(dash - patPos, len - d);
        g.moveTo(a.x + ux * d, a.y + uy * d).lineTo(a.x + ux * (d + draw), a.y + uy * (d + draw));
        d += draw;
      } else {
        d += seg - patPos;
      }
    }
    carry = (carry + len) % seg;
  }
  g.stroke({ width, color, alpha });
}

// Точки контура прямоугольника: острого или скруглённого (углы — короткими дугами).
function rectPoints(r: Rect4, radius: number): Array<{ x: number; y: number }> {
  if (radius <= 0) return [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }, { x: r.x, y: r.y }];
  const rr = Math.min(radius, r.w / 2, r.h / 2);
  const pts: Array<{ x: number; y: number }> = [];
  const arc = (cx: number, cy: number, a0: number, a1: number): void => {
    const N = 5;
    for (let i = 0; i <= N; i++) {
      const a = a0 + ((a1 - a0) * i) / N;
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
  };
  arc(r.x + rr, r.y + rr, Math.PI, Math.PI * 1.5); // верх-лево
  arc(r.x + r.w - rr, r.y + rr, Math.PI * 1.5, Math.PI * 2); // верх-право
  arc(r.x + r.w - rr, r.y + r.h - rr, 0, Math.PI * 0.5); // низ-право
  arc(r.x + rr, r.y + r.h - rr, Math.PI * 0.5, Math.PI); // низ-лево
  pts.push({ ...pts[0]! }); // замкнуть
  return pts;
}

// Dashed-прямоугольник (со скруглением углов при radius>0 — как у solid-рамки дропзоны).
function dashRect(g: Graphics, r: Rect4, dash: number, gap: number, color: number, width: number, alpha = 1, radius = 0): void {
  dashPath(g, rectPoints(r, radius), dash, gap, color, width, alpha);
}

// Узел-стрелка = МЁРТВАЯ ПЕТЛЯ: прямые хвосты from→X→to, в центре X — каплевидная петля с
// ПЕРЕКРЕСТИЕМ у основания. Одна кубическая безье P0=P3=X с контролами вверх-ВПРАВО и вверх-ВЛЕВО
// (свап) — кривая уходит вправо, возвращается слева и сама себя пересекает у X → капля (шире вверху).
function drawKnot(g: Graphics, from: { x: number; y: number }, to: { x: number; y: number }, color: number, width: number): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  // перпендикуляр, ориентированный ВВЕРХ экрана (меньший y).
  let px = -uy;
  let py = ux;
  if (py > 0) {
    px = -px;
    py = -py;
  }
  const at = (a: number, h: number) => ({ x: from.x + ux * a + px * h, y: from.y + uy * a + py * h });
  const norm = (vx: number, vy: number) => {
    const m = Math.hypot(vx, vy) || 1;
    return { x: vx / m, y: vy / m };
  };
  const ac = L * 0.5; // центр
  const w = L * 0.12; // разнос ВЗЛЁТА (левее) и ПОСАДКИ (правее)
  const W = L * 0.26; // разброс контролов вбок (капля шире вверху; W>w → перекрестие между A и B)
  const H = L * 0.42; // высота петли (пониже)
  const A = at(ac - w, 0); // взлёт
  const B = at(ac + w, 0); // посадка
  const c1 = at(ac + W, H); // контрол вверх-вправо
  const c2 = at(ac - W, H); // контрол вверх-влево (свап → самопересечение между A и B)
  const dA = norm(c1.x - A.x, c1.y - A.y); // касательная петли на взлёте
  const dB = norm(B.x - c2.x, B.y - c2.y); // касательная петли на посадке
  // ХВОСТЫ кубические с C1-непрерывностью: у from/to — вдоль оси (горизонтально), у A/B — по касательной
  // петли. Итог гладкий: ease-in подъём, петля, ease-out спуск — без излома на стыках.
  const tin = Math.hypot(A.x - from.x, A.y - from.y);
  const tout = Math.hypot(to.x - B.x, to.y - B.y);
  g.moveTo(from.x, from.y);
  g.bezierCurveTo(from.x + ux * tin * 0.55, from.y + uy * tin * 0.55, A.x - dA.x * tin * 0.4, A.y - dA.y * tin * 0.4, A.x, A.y);
  g.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, B.x, B.y);
  g.bezierCurveTo(B.x + dB.x * tout * 0.4, B.y + dB.y * tout * 0.4, to.x - ux * tout * 0.55, to.y - uy * tout * 0.55, to.x, to.y);
  g.stroke({ width, color });
  // наконечник у `to` вдоль оси стрелки.
  const s = 11;
  const nx = -uy;
  const ny = ux;
  g.moveTo(to.x - ux * s + nx * s * 0.5, to.y - uy * s + ny * s * 0.5)
    .lineTo(to.x, to.y)
    .lineTo(to.x - ux * s - nx * s * 0.5, to.y - uy * s - ny * s * 0.5)
    .stroke({ width, color });
}
