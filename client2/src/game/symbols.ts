import type { Suit } from "./card";

// SVG-символы — ЕДИНЫЙ источник для КАНВАСА (Pixi рисует путь через g.svg) и HTML (инлайн <svg>).
// Раньше масти рисовались символом-глифом шрифта (♠♥♦♣) и «плясали» между шрифтами/платформами
// (как эмодзи) — SVG рендерится одинаково везде. Пути в квадрате 0..24, центр (12,12). Чистые данные.

export const SVG_VIEWBOX = 24;
// Масти — квадрат 24; палец 🖕 — свой НЕквадратный холст 124×171 (икона Wikimedia, единый path-силуэт).
export const FINGER_VIEWBOX = { w: 124, h: 171 } as const;

export const SUIT_PATH: Record<Suit, string> = {
  "♥": "M12 20.5C12 20.5 3.5 13.8 3.5 8.3C3.5 5.6 5.6 4 7.8 4C9.6 4 11.2 5.2 12 6.6C12.8 5.2 14.4 4 16.2 4C18.4 4 20.5 5.6 20.5 8.3C20.5 13.8 12 20.5 12 20.5Z",
  "♦": "M12 2.5L20.5 12L12 21.5L3.5 12Z",
  "♠": "M12 3C12 3 4 9.5 4 14.5C4 17 6 18.3 8 17.8C9.2 17.5 10 16.7 10.4 15.8C10.2 17.9 9.3 19.6 7.6 20.7L16.4 20.7C14.7 19.6 13.8 17.9 13.6 15.8C14 16.7 14.8 17.5 16 17.8C18 18.3 20 17 20 14.5C20 9.5 12 3 12 3Z",
  "♣": "M12 3A3.4 3.4 0 0 0 8.7 6.4A3.4 3.4 0 0 0 9.3 8.1A3.4 3.4 0 1 0 10.7 13.9C10.5 16.2 9.4 18.6 7.6 20.7L16.4 20.7C14.6 18.6 13.5 16.2 13.3 13.9A3.4 3.4 0 1 0 14.7 8.1A3.4 3.4 0 0 0 15.3 6.4A3.4 3.4 0 0 0 12 3Z",
};

// Средний палец 🖕 — единый path-силуэт (икона Wikimedia Commons «The middle finger», public domain).
// SVG вместо эмодзи: эмодзи «пляшут» по платформам (у тебя на скринах один, у меня другой), SVG
// рисуется одинаково в html и на канвасе. Один замкнутый контур: средний палец торчит (кончик y≈8),
// остальные согнуты. Заливается ОДНИМ цветом (обводка не нужна). Холст НЕквадратный — FINGER_VIEWBOX.
export const FINGER_PATH =
  "M 34.272792,168.74752 L 104.92176,168.74752 L 121.12152,123.29818 L 121.12152,70.648951 C 121.12152,63.32795 97.271872,58.119526 97.271872,62.099076 L 97.271872,78.298839 L 97.271872,54.899181 C 97.271872,50.63179 73.549337,47.398034 73.549337,54.899181 L 73.549337,72.448924 L 73.549337,8.5498578 C 67.005561,-2.7842939 50.022562,2.6459339 50.022562,8.5498578 L 50.022562,73.798905 L 50.022562,54.449187 C 50.022562,48.609481 26.22282,48.735743 26.22282,54.449187 L 26.22282,104.39846 L 26.22282,78.72622 C 26.32241,71.969226 3.6180734,71.240435 3.2232454,78.72622 L 3.2232454,105.74844 L 34.272792,168.74752 z";

export const hexColor = (c: number): string => "#" + c.toString(16).padStart(6, "0");

// Полный <svg>-элемент одного пути с заливкой — для Pixi (Graphics.svg) И как основа HTML.
// vb — размеры холста (по умолчанию квадрат мастей 24×24); sizePx задаёт ВЫСОТУ, ширина — по пропорции.
export function symbolSvg(path: string, color: number, sizePx?: number, vb: { w: number; h: number } = { w: SVG_VIEWBOX, h: SVG_VIEWBOX }): string {
  const size = sizePx ? ` width="${(sizePx * vb.w) / vb.h}" height="${sizePx}"` : "";
  return `<svg${size} viewBox="0 0 ${vb.w} ${vb.h}" xmlns="http://www.w3.org/2000/svg"><path d="${path}" fill="${hexColor(color)}"/></svg>`;
}

export const suitSvg = (suit: Suit, color: number, sizePx?: number): string => symbolSvg(SUIT_PATH[suit], color, sizePx);
export const fingerSvg = (color: number, sizePx?: number): string => symbolSvg(FINGER_PATH, color, sizePx, FINGER_VIEWBOX);

// Для КАНВАСА (Pixi Graphics.svg): без viewBox/размера — сырые координаты 0..24, масштаб задаёт движок.
export const symbolCanvasSvg = (path: string, color: number): string => `<svg><path d="${path}" fill="${hexColor(color)}"/></svg>`;
