// LABELED — a caption the element carries, ALREADY WRITTEN. The kit knows nothing of localization
// (CANONS §6): the string arrives in the viewer's language from whoever built the tree, and this
// atom just holds it. `label` is `own` — a piece's caption is about the piece.
//
// It carries the string, never the language: there is no locale, no key, no source here. `labelParams`
// (interpolation) is deliberately NOT a field yet — it returns with the first mechanism that formats.

import { defineAtom } from "../atom.js";

export interface LabeledFields {
  /** The caption, already written in the viewer's language. An empty string is "no caption". */
  readonly label: string;
  /**
   * WHICH ROLE this caption is — a registered text style's name (`registerTextStyle`), never a
   * font. "Title" and "body" are what a tree can say and a designer can re-decide; a family and a
   * size are the theme's answer, and a node that named one would be deciding for every desk it
   * ever lands on. Empty is the desk's default face, and so is a name nobody registered.
   */
  readonly style: string;
}

export const Labeled = defineAtom<LabeledFields>({
  name: "Labeled",
  requires: [],
  defaults: { label: "", style: "" },
  classes: { label: "own", style: "own" },
});
