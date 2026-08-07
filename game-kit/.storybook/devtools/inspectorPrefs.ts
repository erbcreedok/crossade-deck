// How the reader likes the tree — kept across stories and reloads, and nowhere near state.
//
// On a docs page the tree is a block of its own under the canvas, so the only thing worth
// remembering is whether it is open. It starts open: in this slice the tree is the ONLY thing
// a scene has to show, and a page that opens with it folded away reads as a page with nothing
// in it.

const OPEN_KEY = "gk.inspector.open";

export function inspectorOpen(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(OPEN_KEY) !== "0";
}

export function setInspectorOpen(open: boolean): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(OPEN_KEY, open ? "1" : "0");
}
