// THE ONLY FILE IN THIS GAME THAT HOLDS A COLOUR. A guard scans for the second one.
//
// The values are client1's, verbatim: warm brown panels and a single gold. The kit's own palette is
// not used and not fought with — `paint()` passes an unknown name through untouched, so a theme
// switch changes nothing a control here draws. That is correct rather than lazy: this look is
// CONTENT, the way a red suit stays red on a dark desk, not a desk theme somebody may re-pick.
//
// THE SAME LITERALS ALSO LIVE IN `apps/hub/src/look/palette.ts`. One palette in two files is a
// fault, not a design: its right home is a package both apps depend on. Written down here so the
// next reader inherits the debt knowingly instead of discovering it.

export const PALETTE = {
  /** A control's face: warm dark brown. */
  panel: "#3a2a1d",
  /** Text. */
  ink: "#f5ead0",
  /** Text, quieter — the words of a control that declines to act. */
  inkDim: "#cdb98f",
  /** The one gold. The ring around every plate. */
  gold: "#f2c14e",
  /** The keyline, and the ink a cast shadow is drawn in. */
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
