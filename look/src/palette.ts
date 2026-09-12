// THE ONLY FILE IN THE HUB THAT HOLDS A COLOUR. A guard scans for the second one.
//
// The values are client1's, verbatim: a pixel-casino table — felt, warm brown panels, a single
// gold. The kit's own palette is not used and not fought with. Every surface here names a literal,
// `paint()` passes an unknown name through untouched, and a theme switch therefore changes nothing
// the hub draws. That is correct rather than lazy: this look is CONTENT, the way a red suit stays
// red on a dark desk, not a desk theme somebody may re-pick.
//
// The kit's own `no-raw-colour` guard covers `game-kit/src` and does not reach an app, so the same
// law is kept here by the hub's own scan — one place holds the colours, or twenty places will.

export const PALETTE = {
  /** The table. */
  felt: "#173d2d",
  /** The club glyph tiled over it, a shade down. */
  feltDark: "#0f2e22",
  /** A panel: warm dark brown. */
  panel: "#3a2a1d",
  /** A panel one step up — a raised row, a secondary button. */
  panelLight: "#4a3627",
  /** A well: an inset, an inactive tile, an input's ground. */
  well: "#1c120b",
  /** Text. */
  ink: "#f5ead0",
  /** Text, quieter. */
  inkDim: "#cdb98f",
  /** The one gold. Border ring, title, selection. */
  gold: "#f2c14e",
  /** Alarm. */
  danger: "#e0483f",
  /** The keyline and the hard drop shadow. */
  black: "#0b0704",
  /** Дерево мебели: кромка кнопки, рамка плашки — на шаг светлее панели и заметно теплее. */
  wood: "#6b4d2c",
  /** The gold sparkle, muted for the table screen — client1's `grayscale(.5) brightness(.85)`. */
  sparkleDim: "#b09a5c",
} as const;

/**
 * ВОСЕМЬ ЛЮБИМЫХ ЦВЕТОВ — те, которыми человек метит СЕБЯ: кружок профиля, его метки за столом.
 *
 * Восемь, а не колесо: цвет должен быть узнаваем через стол с другого конца, а не подобран. Их
 * место здесь по тому же закону, по какому здесь лежит всё остальное — одно место держит цвета,
 * или их будет держать двадцать.
 */
export const FAVOURITE_INKS = [
  "#f2c14e",
  "#7fd1b9",
  "#e08b3f",
  "#b98fe0",
  "#8fb4e0",
  "#e0483f",
  "#a8e08f",
  "#e08fb4",
] as const;

/**
 * ЦВЕТ ПАЛИТРЫ, ВИДИМЫЙ НАСКВОЗЬ — стекло полосы, полупрозрачная тень, затемнение под листом.
 *
 * Живёт здесь по тому же закону, по которому здесь лежат сами цвета: собрать `rgba(...)` — значит
 * НАЗВАТЬ цвет, и место, где это делают руками, становится вторым держателем палитры. Сторож
 * (`palette.test.ts`) ловит именно это, и поймал.
 */
export function tint(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// LENGTHS. client1 is a pixel design and its numbers are pixels; the kit measures in units, so the
// conversion happens once, here, against the size a tile is drawn at. Written as a division rather
// than as a decimal so the original number stays readable next to the design it came from.
const PX = 1 / 56;

/** The 4px black keyline. */
export const BORDER_U = 4 * PX;
/** The 4px gold ring outside it — the motif the whole of client1 is built on. */
export const RING_U = 4 * PX;
/** How far a press displaces a tile: 3px down and right, exactly as `.pixel-btn:active` did. */
export const PRESS_PX = 3;
/**
 * The felt's club tile, in units — NOT through `PX`, and the exception is worth its four lines.
 *
 * `PX` converts a CONTROL's pixels: client1's 4px keyline is 4px because a finger and a screen say
 * so, and it stays that thickness whatever the table shows. A background pattern is the opposite
 * kind of number — it is a fraction of the SCREEN, and client1's 72px tile is one eighteenth of a
 * desktop's width. The hub lays 9.2 units across whatever screen it is on, so the same texture is
 * 9.2/18 of a unit, and it keeps its density on a phone as well as on a monitor.
 */
export const CLUB_U = 9.2 / 18;

/**
 * The diamond sparkle's own tile, in units — the same reasoning as `CLUB_U`, a fraction of the
 * screen rather than a control's pixels. client1 draws its scatter on a 520px canvas but tiles it
 * at 340px — a 0.65 scale-down, not the canvas's own size — so the port scales `CLUB_U`'s 72px tile
 * by that same 340/72 ratio rather than by the 520px the glyphs are drawn at.
 */
export const SPARK_U = CLUB_U * (340 / 72);
