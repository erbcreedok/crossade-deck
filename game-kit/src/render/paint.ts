// A COLOUR, AS DATA — the one type every fill, stroke and tint in the kit is painted with.
//
// It lived in `surfaces.ts` as `type Paint = string` and outgrew it. A colour is a TOKEN NAME
// (`accent`, `panelBg`) the painter resolves against its palette — that law is unchanged and is
// why a GPU canvas, which has no CSS cascade, can still find the shade. What is new is the second
// shape: a colour there are INFINITELY MANY of.
//
// A territory game hands each of N runtime players their own hue; a timer ring drifts its colour
// as the clock runs out. Enumerating those in a registry is the very "record-per-value" the kit
// forbids (the `Axis76` lesson: a changing magnitude is a PARAMETER, not a new named entry). So a
// parametric colour is a token NAME plus a NUMBER — `{ token: "spin", param: 0.7 }` — and the
// painter turns the pair into a shade at resolve time, per client, against its own palette. N
// players are one name and N numbers, never N hexes and never N records; the wire still carries
// only names and numbers, and the raw colour is still born only in `theme.ts`.

/** A named colour recipe driven by one number: a hue wheel, a wash, a drift. Resolved in `theme.ts`. */
export interface ParametricPaint {
  /** The colour recipe's name — resolved per client, exactly like a flat token. */
  readonly token: string;
  /** The knob: a hue turn, a mix fraction, whatever the recipe reads. Crosses the wire as a number. */
  readonly param: number;
}

/** A theme token name, a literal the renderer understands, OR a parametric colour (`{token, param}`). */
export type Paint = string | ParametricPaint;

/** Is this the parametric shape? The one place the two are told apart, so no call site improvises. */
export function isParametric(paint: Paint): paint is ParametricPaint {
  return typeof paint === "object";
}
