// How the reader likes the block under a scene — kept across stories and reloads, and nowhere
// near state.
//
// On a docs page that block is a card of its own: one hide/show, and TABS inside it, because
// the tree and the controls are two views of the same story rather than two features. It starts
// open on the tree: in this slice the tree is the ONLY thing a scene has to show, and a page
// that opens with it folded away reads as a page with nothing in it.

const OPEN_KEY = "gk.inspector.open";
const TAB_KEY = "gk.inspector.tab";

/** Which view of the story the card is showing. */
export type PanelTab = "tree" | "controls";

const TABS: PanelTab[] = ["tree", "controls"];

export function inspectorOpen(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(OPEN_KEY) !== "0";
}

export function setInspectorOpen(open: boolean): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(OPEN_KEY, open ? "1" : "0");
}

/** A stored value that is no longer a tab reads as no preference — never as a blank card. */
export function inspectorTab(): PanelTab {
  if (typeof localStorage === "undefined") return "tree";
  const stored = localStorage.getItem(TAB_KEY) as PanelTab | null;
  return stored && TABS.includes(stored) ? stored : "tree";
}

export function setInspectorTab(tab: PanelTab): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(TAB_KEY, tab);
}
