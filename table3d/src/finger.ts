// СКРЫТАЯ КАРТА ЛИЦОМ КО МНЕ. Лицо от меня закрыто, но она повёрнута ко мне лицом — вместо рубашки на ней рука с оттопыренным
// пальцем: «тут ты ничего не увидишь». Оттенок — свой у каждой карты, по её id, и с мастью и достоинством никак не связан:
// разные карты — разные оттенки, одна и та же — всегда один и тот же (не мигает при перерисовке).
// Рисуется эмодзи 🖕 с модификатором тона кожи, на бумаге карты: в 3D — холстом, в окнах HUD — блоком.

/** Оттенки: без модификатора (жёлтый) и пять тонов кожи. */
const TONES = ["", "\u{1F3FB}", "\u{1F3FC}", "\u{1F3FD}", "\u{1F3FE}", "\u{1F3FF}"] as const;
export const FINGER_KINDS = TONES.length;

/** Номер оттенка карты `id`: хэш строки, к масти и достоинству не привязан. */
export function fingerKind(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % FINGER_KINDS;
}
export const fingerEmoji = (kind: number): string => "\u{1F595}" + TONES[kind % FINGER_KINDS]!;

const PAPER = "#f5ead0", INK = "#0b0704", EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

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
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `${Math.round(w * 0.8)}px ${EMOJI_FONT}`;
  g.fillText(fingerEmoji(kind), w / 2, h / 2 + w * 0.04);
}

/** То же для окна HUD: блок по размеру места карты, шириной `w`. */
export const fingerHtml = (id: string, w: number): string =>
  `<div style="width:100%;height:100%;box-sizing:border-box;border-radius:${Math.round(w * 0.12)}px;background:${PAPER};box-shadow:0 0 0 1px ${INK};display:flex;align-items:center;justify-content:center;font:${Math.round(w * 0.8)}px/1 ${EMOJI_FONT};pointer-events:none">${fingerEmoji(fingerKind(id))}</div>`;
