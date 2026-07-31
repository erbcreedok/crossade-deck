import type { Graphics } from "pixi.js";
import type { MarkerConfig, ShowPolicy } from "../engine/marker";

// Иконки меток захвата и стандартная конфигурация грипа. В локальных координатах, центр (0,0).
//
// Живут в kit, а не в движке: движку всё равно, как метка нарисована (он знает только hitTest и
// политику видимости), а стендам — и песочнице, и каталогу — нужен ОДИН набор иконок, иначе
// «ручка» в каталоге выглядела бы иначе, чем на столе.

const MARK = 0xcdb98f;

/** Драггер: три точки — «взяться». Еле виден: это аффорданс, а не мусор на столе. */
export function drawGrip(g: Graphics): void {
  for (const dx of [-8, 0, 8]) g.circle(dx, 0, 2.6).fill({ color: MARK });
}

/** Якорь «когда унесли»: якорь как якорь — кольцо, шток, перекладина, лапы. */
export function drawAnchorIcon(g: Graphics): void {
  g.circle(0, -9, 3).stroke({ width: 1.6, color: MARK });
  g.moveTo(0, -6).lineTo(0, 9).stroke({ width: 1.6, color: MARK });
  g.moveTo(-6, -1).lineTo(6, -1).stroke({ width: 1.6, color: MARK });
  g.moveTo(-7, 3).lineTo(0, 9).lineTo(7, 3).stroke({ width: 1.6, color: MARK });
}

/** Якорь-булавка: ромб с точкой — «место закреплено». */
export function drawPinIcon(g: Graphics): void {
  g.moveTo(0, -9).lineTo(7, 0).lineTo(0, 9).lineTo(-7, 0).closePath().stroke({ width: 1.6, color: MARK });
  g.circle(0, 0, 1.8).fill({ color: MARK });
}

/** Якорь-кольцо: полое — «здесь пусто». */
export function drawRingIcon(g: Graphics): void {
  g.circle(0, 0, 8).stroke({ width: 1.6, color: MARK });
}

/**
 * Стандартный грип стенда: под низом цели, хит-зона шире рисунка (в неё надо попадать пальцем),
 * при драге едет за пальцем ПОД пачкой — так он не закрывает то, что несут.
 */
export function gripConfig(cardH: number): Omit<MarkerConfig, "show"> & { show?: ShowPolicy } {
  return {
    draw: drawGrip,
    offset: { x: 0, y: cardH / 2 + 9 },
    hit: { w: 44, h: 22 },
    follow: true,
    followOffset: { x: 0, y: cardH * 0.62 },
  };
}
