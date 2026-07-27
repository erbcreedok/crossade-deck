import { Application, RenderTexture } from "pixi.js";
import { AMBER, buildContent } from "../fingerContent";
import { dustPoints } from "../censorConfig";
import { TEX_H, TEX_W } from "./constants";
import type { CensorSource } from "./censorField";

// Извлечение силуэта «лица скрытой карты» (fingerContent.buildContent) в пиксель-сетку и облако
// точек. Требует Pixi-рендер (RenderTexture + extract.pixels), поэтому вынесено из чистого
// censorConfig. Один источник и для CPU-мозаики стенда, и для частиц-пыли (стенд + доска).

/** Булева пиксель-сетка контента под размер блока: рендерим в cols×rows и читаем альфу. */
export function buildFingerGrid(app: Application, block: number): CensorSource {
  const content = buildContent();
  const cols = Math.max(1, Math.round(TEX_W / block));
  const rows = Math.max(1, Math.round(TEX_H / block));
  content.scale.set(cols / TEX_W, rows / TEX_H);
  const rt = RenderTexture.create({ width: cols, height: rows });
  app.renderer.render({ container: content, target: rt });
  const { pixels } = app.renderer.extract.pixels(rt);
  const on: boolean[] = new Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) on[i] = pixels[i * 4 + 3]! > 100;
  content.destroy({ children: true });
  rt.destroy(true);
  return { cols, rows, block, on, color: AMBER };
}

/** Облако точек рождения частиц по силуэту фака, с центром облака в (cx,cy). perCell=2 — как у TG. */
export function buildFingerDustPoints(app: Application, step: number, cx: number, cy: number): Array<{ x: number; y: number }> {
  const src = buildFingerGrid(app, step);
  return dustPoints(src.on, src.cols, src.rows, step, 2, cx, cy);
}
