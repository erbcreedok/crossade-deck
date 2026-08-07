// VIEWER SETTINGS — the third plane, and the one that never travels.
//
// Spec is what the author writes and it goes on the wire. State is what happens to a node.
// These are neither: they describe the ONLOOKER. Two players may hold different values and
// still see the same truth — so nothing here may reach the state, and nothing here may be
// asked of a node (CANONS.md, the three-planes rule).
//
// They cascade: the consumer produces them once, the host carries them, and the resolve
// context hands them down the tree as defaults. A scene does not wire them one by one, or the
// sixth toggle would be wired in five different ways.

/**
 * The vocabulary of an onlooker lives HERE, in the model, because `ResolveContext` carries it
 * — while the VALUES do not: the palettes are in `render/theme.ts`.
 *
 * There is no language here, and no text of any kind. The kit knows nothing of localization:
 * a caption reaches it already written, as an ordinary string on the node that carries it
 * (`Labeled`, when it arrives). Which languages exist, where the words are kept, how a plural
 * or a date is formed — all of it belongs to whoever assembles the tree, and the node tree is
 * assembled per client anyway: ids have to agree between players, wording does not.
 */
export type ThemeName = "dark" | "light";

export interface ViewerSettings {
  /** Dark or light. Local, like motion-reduce. */
  readonly theme: ThemeName;
  /**
   * Override for the HUD etalon in px. Absent = the host computes it from the viewport.
   * This is the accessibility knob: a viewer who finds the icons large turns it down, and
   * the sizes in units are untouched.
   */
  readonly hudUnit?: number;
}

export const DEFAULT_VIEWER: ViewerSettings = { theme: "dark" };

/**
 * Not implemented yet, on purpose — each arrives with the thing it acts on, so a toggle is
 * never a control over nothing:
 *   debugLayers  — with `Surfaced`: layers overlay a picture, and nothing paints yet.
 *   viewer       — with `Private`: nothing to withhold from anyone.
 *   motionReduce — with the first animation.
 * Adding them here is one field and one toolbar entry each; the cascade below is what makes
 * that true.
 */
export function withViewer(base: ViewerSettings, patch: Partial<ViewerSettings>): ViewerSettings {
  return { ...base, ...patch };
}
