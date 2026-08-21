// THE DRAWING PRIMITIVES — a path from a polyline, and the matrices that map a texture into a box.
// Small enough to read at a glance, which is the point of them being apart: everything else in the
// folder can then be read without wondering whether a contour is being computed on the way past.

import { Graphics, Matrix, Texture } from "pixi.js";

/** A polyline into a path. The one drawing primitive this file needs, and it reads no sorts. */
export function trace(g: Graphics, points: readonly { readonly x: number; readonly y: number }[], close: boolean): void {
  points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
  if (close) g.closePath();
}

/**
 * The matrix that maps a texture into a box, in the local space the fill is drawn in.
 *
 * Pixi wants texture space, so a box of `w × h` pixels holding a texture of `tw × th` is a
 * scale of `w/tw` and a move to the box's top-left corner.
 */
export function boxMatrix(texture: Texture, box: { x: number; y: number; w: number; h: number }): Matrix {
  return new Matrix()
    .scale(box.w / texture.width, box.h / texture.height)
    .translate(box.x - box.w / 2, box.y - box.h / 2);
}

/** A tiled fill: the same map, but anchored to the AREA so the tiles line up across it. */
export function tileMatrix(texture: Texture, image: { x: number; y: number; w: number; h: number }): Matrix {
  return boxMatrix(texture, image);
}
