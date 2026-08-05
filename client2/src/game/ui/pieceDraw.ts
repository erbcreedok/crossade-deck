import { Container, Graphics, Text } from "pixi.js";

// ВИЗУАЛЫ ФИШЕК — чистое рисование в ЛОКАЛЬНЫХ координатах (центр 0,0). Отдельно от Piece:
// предмет — это физика/тень/способности, а как выглядит конкретный вид — забота реестра
// (pieceKinds), который и передаёт build(root) при создании.

/** Покерная фишка: диск номинала, кремовые edge-споты по ободу, кремовое кольцо, светлое ядро, номинал. */
export function drawChip(root: Container, radius: number, color: number, label: string): void {
  const cream = 0xf2ecda;
  const g = new Graphics();
  // тело + тонкий тёмный кант (чтобы читалось на любом фоне)
  g.circle(0, 0, radius).fill({ color }).stroke({ width: radius * 0.05, color: darken(color, 0.5) });
  // edge-споты: 6 кремовых блоков по ободу (радиально-тангенциальные дуги)
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 - Math.PI / 2;
    g.arc(0, 0, radius * 0.84, a - 0.24, a + 0.24).stroke({ width: radius * 0.34, color: cream, cap: "butt" });
  }
  // кремовое кольцо + светлое ядро (перекрывает внутренние концы спотов — остаются только на ободе)
  g.circle(0, 0, radius * 0.6).stroke({ width: radius * 0.09, color: cream });
  g.circle(0, 0, radius * 0.56).fill({ color: lighten(color, 0.12) });
  root.addChild(g);
  if (label) root.addChild(glyph(label, radius * 0.8, textInk(lighten(color, 0.12)), radius * 0.05, darken(color, 0.6)));
}

/** Шахматная фигура — СПЛОШНОЙ силуэт (без диска-подложки): глиф чёрного набора, крашенный в
 *  команду, с контрастным контуром. Белая — кремовая с тёмным кантом, чёрная — тёмная со светлым. */
export function drawChessPiece(root: Container, size: number, dark: boolean, sym: string): void {
  const fill = dark ? 0x2a2521 : 0xf1e8d4;
  const ink = dark ? 0xc9b892 : 0x241c14;
  root.addChild(glyph(sym, size * 1.15, fill, size * 0.045, ink));
}

// Текст-глиф по центру (0,0), с настраиваемым контуром.
function glyph(text: string, size: number, color: number, strokeW: number, strokeColor = 0x000000): Container {
  const t = new Text({
    text,
    style: { fontFamily: "'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols2','DejaVu Sans',serif", fontSize: size, fill: color, stroke: { color: strokeColor, width: strokeW }, align: "center" },
  });
  t.anchor.set(0.5);
  return t;
}

function darken(c: number, f: number): number {
  return mix(c, 0x000000, f);
}
function lighten(c: number, f: number): number {
  return mix(c, 0xffffff, f);
}
function textInk(bg: number): number {
  // Тёмный номинал на светлой фишке и наоборот — по яркости фона.
  const r = (bg >> 16) & 255;
  const gg = (bg >> 8) & 255;
  const b = bg & 255;
  return 0.299 * r + 0.587 * gg + 0.114 * b > 140 ? 0x201b16 : 0xf4ecd8;
}
function mix(a: number, b: number, f: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * f);
  const g = Math.round(ag + (bg - ag) * f);
  const bl = Math.round(ab + (bb - ab) * f);
  return (r << 16) | (g << 8) | bl;
}
