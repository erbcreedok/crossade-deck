import { Application, Container, RenderTexture, Sprite, type Texture } from "pixi.js";
import { AMBER, buildContent } from "../fingerContent";
import { colorDustPoints, contrastWeight, dominantColor, dustPoints, thinPoints, type DustPoint } from "../censorConfig";
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

/** Порог непрозрачности клетки: ниже — считаем, что содержимого нет (углы карты скруглены). */
const CELL_ALPHA = 100;

/** Плотность облака над самой «непохожей на фон» клеткой. Подобрано глазами: меньше — рисунок
 *  тонет, больше — краска слипается в кляксы. */
const INK_GAIN = 8;

/** Ниже этой непохожести на фон клетка не рождает частиц вовсе: её пыль неотличима от подложки,
 *  а стоит столько же, сколько видимая. Именно эта отсечка и держит кадр. */
const INK_FLOOR = 0.06;

/** Потолок частиц на одно лицо. Облако перерисовывается каждый кадр — цена линейна по числу точек. */
const MAX_POINTS = 900;

/**
 * Облако точек по НАСТОЯЩЕЙ текстуре лица: каждая клетка отдаёт свой цвет, поэтому пыль выглядит
 * смазом именно этой карты, а не универсальной жёлтой крошкой.
 *
 * Текстуру уменьшаем в сетку cols×rows и читаем пиксели. Уменьшение и есть усреднение: цвет клетки
 * — это средний цвет соответствующего куска лица, ровно то, чем частица и должна быть.
 *
 * Плотность НЕ равномерная: клетки, непохожие на общий тон карты, рождают частиц больше (см.
 * contrastWeight). Равномерная давала рябь, в которой рисунок тонул — краска занимает малую долю
 * лица, а кремовые частицы на кремовой подложке невидимы, и карта выглядела просто чистой.
 */
export function buildTextureDustPoints(app: Application, tex: Texture, step: number, cx: number, cy: number, perCell = 1, gain = INK_GAIN): DustPoint[] {
  const cols = Math.max(1, Math.round(TEX_W / step));
  const rows = Math.max(1, Math.round(TEX_H / step));
  const sprite = new Sprite(tex);
  sprite.setSize(cols, rows);
  const holder = new Container();
  holder.addChild(sprite);
  const rt = RenderTexture.create({ width: cols, height: rows });
  app.renderer.render({ container: holder, target: rt });
  const { pixels } = app.renderer.extract.pixels(rt);
  const cells = new Array<{ on: boolean; color: number }>(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const a = pixels[i * 4 + 3]!;
    if (a <= CELL_ALPHA) {
      cells[i] = { on: false, color: 0 };
      continue;
    }
    // extract отдаёт премультиплицированные каналы — возвращаем истинный цвет, иначе полупрозрачные
    // клетки (кромка карты) выходили бы неестественно тёмными.
    const k = 255 / a;
    const r = Math.min(255, Math.round(pixels[i * 4]! * k));
    const g = Math.min(255, Math.round(pixels[i * 4 + 1]! * k));
    const b = Math.min(255, Math.round(pixels[i * 4 + 2]! * k));
    cells[i] = { on: true, color: (r << 16) | (g << 8) | b };
  }
  holder.destroy({ children: true });
  rt.destroy(true);
  const pts = colorDustPoints(cells, cols, rows, step, perCell, cx, cy, contrastWeight(dominantColor(cells), gain, INK_FLOOR));
  return thinPoints(pts, MAX_POINTS);
}
