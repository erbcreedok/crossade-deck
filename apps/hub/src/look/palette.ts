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
} as const;

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
