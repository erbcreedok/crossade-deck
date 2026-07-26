import type { Suit } from "./card";

// SVG-символы — ЕДИНЫЙ источник для КАНВАСА (Pixi рисует путь через g.svg) и HTML (инлайн <svg>).
// Раньше масти рисовались символом-глифом шрифта (♠♥♦♣) и «плясали» между шрифтами/платформами
// (как эмодзи) — SVG рендерится одинаково везде. Пути в квадрате 0..24, центр (12,12). Чистые данные.

export const SVG_VIEWBOX = 24;

export const SUIT_PATH: Record<Suit, string> = {
  "♥": "M12 20.5C12 20.5 3.5 13.8 3.5 8.3C3.5 5.6 5.6 4 7.8 4C9.6 4 11.2 5.2 12 6.6C12.8 5.2 14.4 4 16.2 4C18.4 4 20.5 5.6 20.5 8.3C20.5 13.8 12 20.5 12 20.5Z",
  "♦": "M12 2.5L20.5 12L12 21.5L3.5 12Z",
  "♠": "M12 3C12 3 4 9.5 4 14.5C4 17 6 18.3 8 17.8C9.2 17.5 10 16.7 10.4 15.8C10.2 17.9 9.3 19.6 7.6 20.7L16.4 20.7C14.7 19.6 13.8 17.9 13.6 15.8C14 16.7 14.8 17.5 16 17.8C18 18.3 20 17 20 14.5C20 9.5 12 3 12 3Z",
  "♣": "M12 3A3.4 3.4 0 0 0 8.7 6.4A3.4 3.4 0 0 0 9.3 8.1A3.4 3.4 0 1 0 10.7 13.9C10.5 16.2 9.4 18.6 7.6 20.7L16.4 20.7C14.6 18.6 13.5 16.2 13.3 13.9A3.4 3.4 0 1 0 14.7 8.1A3.4 3.4 0 0 0 15.3 6.4A3.4 3.4 0 0 0 12 3Z",
};

// Средний палец 🖕 — силуэт «кулак, средний палец вверх». SVG вместо эмодзи: эмодзи «пляшут» по
// платформам (у тебя на скринах один, у меня другой), SVG рисуется одинаково в html и на канвасе.
// Читаемость даёт КОНТРАСТ: один длинный палец (кончик у y≈3.5) и рядом низкие бугры-костяшки
// согнутых пальцев (y≈10) — иначе выходит «палец вверх». Квадрат 0..24, центр по x=12.
export const FINGER_PATH =
  "M4 13C4.3 9.8 8.2 9.8 9.5 11C9.9 7 10.2 3.5 12 3.5C13.8 3.5 14.1 7 14.5 11C15.6 9.5 17 9.5 18 10.3C18.7 9.7 19.6 10.2 20 12.5L20 19Q20 21 18 21L6 21Q4 21 4 19Z";

export const hexColor = (c: number): string => "#" + c.toString(16).padStart(6, "0");

// Полный <svg>-элемент одного пути с заливкой — для Pixi (Graphics.svg) И как основа HTML.
export function symbolSvg(path: string, color: number, sizePx?: number): string {
  const size = sizePx ? ` width="${sizePx}" height="${sizePx}"` : "";
  return `<svg${size} viewBox="0 0 ${SVG_VIEWBOX} ${SVG_VIEWBOX}" xmlns="http://www.w3.org/2000/svg"><path d="${path}" fill="${hexColor(color)}"/></svg>`;
}

export const suitSvg = (suit: Suit, color: number, sizePx?: number): string => symbolSvg(SUIT_PATH[suit], color, sizePx);

// Для КАНВАСА (Pixi Graphics.svg): без viewBox/размера — сырые координаты 0..24, масштаб задаёт движок.
export const symbolCanvasSvg = (path: string, color: number): string => `<svg><path d="${path}" fill="${hexColor(color)}"/></svg>`;
