// СКРЫТАЯ КАРТА ЛИЦОМ КО МНЕ. Лицо от меня закрыто, но она повёрнута ко мне лицом — вместо рубашки на ней рука с оттопыренным
// пальцем: «тут ты ничего не увидишь». Цвет — свой у каждой карты, по её id, и с мастью и достоинством никак не связан:
// разные карты — разные цвета, одна и та же — всегда один и тот же (не мигает при перерисовке).
// Рука нарисована сама, пикселями, как шрифт стола (Tiny5): не системным эмодзи, который у каждого устройства свой.

/** Цвета руки: золотой и пять тонов кожи. */
export const FINGER_FILLS = ["#f2c14e", "#f6d3b0", "#e2aa7d", "#c2803f", "#8a5426", "#54341f"] as const;
export const FINGER_KINDS = FINGER_FILLS.length;

/** Номер цвета карты `id`: хэш строки, к масти и достоинству не привязан. */
export function fingerKind(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % FINGER_KINDS;
}

const PAPER = "#f5ead0", INK = "#0b0704";

/**
 * Рука кулаком, средний палец вверх: строки — ряды, `#` — заливка, `s` — тень (стыки пальцев, сгиб), `h` — блик.
 * Контур чёрным дорисовывается вокруг заливки сам.
 */
const HAND = [
  "......###......",
  ".....#####.....",
  ".....h####.....",
  ".....h####.....",
  ".....h####.....",
  ".....h####.....",
  ".....h####.....",
  "..####s###s###.",
  ".h####s###s####",
  ".h####s###s####",
  "#hss#######ss##",
  "##############.",
  ".#ssssss######.",
  "..############.",
  "...##########..",
  "....########...",
  "....########...",
];
const HW = HAND[0]!.length, HH = HAND.length;

const shade = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1), 16), c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, "0")).join("")}`;
};

/** Клетки руки цвета `kind` с контуром: поле `HW + 2` × `HH + 2`. */
function cells(kind: number): { x: number; y: number; c: string }[] {
  const fill = FINGER_FILLS[kind % FINGER_KINDS]!, dark = shade(fill, 0.72), light = shade(fill, 1.18);
  const at = (x: number, y: number) => HAND[y]?.[x] ?? ".";
  const out: { x: number; y: number; c: string }[] = [];
  for (let y = -1; y <= HH; y++) for (let x = -1; x <= HW; x++) {
    const ch = at(x, y);
    if (ch !== ".") out.push({ x: x + 1, y: y + 1, c: ch === "s" ? dark : ch === "h" ? light : fill });
    else if ([-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => at(x + dx, y + dy) !== "."))) out.push({ x: x + 1, y: y + 1, c: INK });
  }
  return out;
}

/** Лицо скрытой карты на холсте `w × h` (карта 1 : 1.4). */
export function drawFingerCard(g: CanvasRenderingContext2D, w: number, h: number, kind: number): void {
  const r = w * 0.09, line = w * 0.02;
  g.clearRect(0, 0, w, h);
  g.beginPath();
  g.roundRect(line / 2, line / 2, w - line, h - line, r);
  g.fillStyle = PAPER;
  g.fill();
  g.lineWidth = line;
  g.strokeStyle = INK;
  g.stroke();
  // Целое число точек на клетку — пиксели без размытия.
  const px = Math.max(1, Math.floor((w * 0.7) / (HW + 2))), ox = Math.round((w - px * (HW + 2)) / 2), oy = Math.round((h - px * (HH + 2)) / 2);
  for (const { x, y, c } of cells(kind)) { g.fillStyle = c; g.fillRect(ox + x * px, oy + y * px, px, px); }
}

/** То же для окна HUD: блок по размеру места карты, шириной `w`. */
export const fingerHtml = (id: string, w: number): string => {
  const kind = fingerKind(id);
  return `<div data-finger="${kind}" style="width:100%;height:100%;box-sizing:border-box;border-radius:${Math.round(w * 0.12)}px;background:${PAPER};box-shadow:0 0 0 1px ${INK};display:flex;align-items:center;justify-content:center;pointer-events:none">`
    + `<svg viewBox="0 0 ${HW + 2} ${HH + 2}" width="70%" shape-rendering="crispEdges" style="display:block">${cells(kind).map(({ x, y, c }) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`).join("")}</svg></div>`;
};
