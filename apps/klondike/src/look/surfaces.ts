// WHAT A CONTROL LOOKS LIKE HERE, as registry entries — client1's plate, its caption, and the row
// the three of them stand in.
//
// THE PLATE IS TWO RECORDS because one quad carries one stroke and this motif has two: a gold ring
// OUTSIDE a black keyline. `button()` already assembles that shape from `surface` + `face` +
// `inset`, so this file names records and never draws anything.
//
// Zero corner radius comes free: client1 rounds nothing, and a record that names no `radius` has
// none. Nothing has to be switched off.

import { registerLayout, registerSurface, registerTextStyle, rowLayout } from "game-kit";
import { BORDER_U, PALETTE } from "./palette.js";

/** The gold plate a control stands on. */
export const PLATE = "sol/control";
/** The brown face inside it — what shows between the two is the ring. */
export const FACE = "sol/control/face";
/** The caption role: client1's pixel face, in cream. A ROLE, never a font at a call site. */
export const LABEL = "sol/label";
/**
 * The same words, quieter — worn by a control that declines to act.
 *
 * A SECOND ROLE rather than a coat, because the kit's coats are paint over an AREA and a caption is
 * drawn above them: the asleep wash dims the plate and the face and leaves the words at full ink,
 * so a dead control reads bright. Which colour a role is worth is the look's business anyway.
 */
export const LABEL_QUIET = "sol/label-quiet";
/** The row the controls stand in. */
export const BAR = "sol/bar";

// THE CONTROL BOX, IN UNITS, sized against the table it sits over: a card is 1 × 1.4, and the bar
// stands in the strip above the deal. A control is a hair wider than a card and a third as tall, so
// the three of them together (about 5.4 units) read as a row over an 8.6-unit table rather than as
// a second table. The width is what the longest caption needs — "Подсказка" is nine glyphs of a
// face whose every glyph is one em wide.
export const CONTROL_W = 1.72;
export const CONTROL_H = 0.44;
/** Space between neighbours — enough that three gold rings do not read as one long plate. */
const GAP = 0.16;

export function installKlondikeLook(): void {
  // The gold plate. Its caller insets the face by `RING_U` (palette.ts), so what shows between the
  // two is a ring of that width — client1's `box-shadow: 0 0 0 4px` spread, expressed as geometry.
  registerSurface(PLATE, { layers: [{ paint: PALETTE.gold }] });

  // The face: a brown panel with the black keyline drawn INSIDE its contour (`alignment: 1`), so a
  // bordered node occupies exactly the box it declared and the row stays even.
  registerSurface(FACE, {
    layers: [{ paint: PALETTE.panel }],
    stroke: { color: PALETTE.black, width: BORDER_U, alignment: 1 },
  });

  // One face, one size, two inks — written once so the quiet role cannot drift into another size.
  const caption = { family: "'Press Start 2P', monospace", size: 0.155, weight: 400, lineHeight: 1.2 };
  registerTextStyle(LABEL, { ...caption, fill: PALETTE.ink });
  registerTextStyle(LABEL_QUIET, { ...caption, fill: PALETTE.inkDim });

  registerLayout(BAR, rowLayout({ gap: GAP, padding: 0 }));
}
