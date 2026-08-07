// The hud-etalon knob, in one place because it is read from two sides: the scene toolbar
// renders these choices, and the preview turns the chosen one into viewer settings. Two
// copies of this list would drift the first time a value is added.
//
// `auto` is not a number and must not be one: it means "the host computes the etalon from
// the viewport". A sentinel number (0, -1) would be a value that looks legal all the way
// down to the layout.

export const HUD_UNIT_CHOICES = ["auto", 34, 46, 60] as const;

export type HudUnitChoice = (typeof HUD_UNIT_CHOICES)[number];

/** Absent means the host decides — which is why this returns a partial, not a number. */
export function hudUnitPatch(choice: HudUnitChoice): { hudUnit?: number } {
  return choice === "auto" ? {} : { hudUnit: choice };
}
