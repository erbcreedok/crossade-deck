// How the reader likes the block under a scene — kept across stories and reloads, and nowhere
// near state.
//
// On a docs page that block is a card of its own: one hide/show, and TABS inside it, because
// the tree and the controls are two views of the same story rather than two features. It starts
// FOLDED: a docs page is prose first, and a card that opens itself under every canvas pushes
// the next paragraph below the fold. The exception is a bare canvas — a story that paints
// nothing — where the page itself opens the card on the tree, so the reader sees there IS
// something; that call belongs to the page, not to this preference.

const OPEN_KEY = "gk.inspector.open";
const TAB_KEY = "gk.inspector.tab";

/** Which view of the story the card is showing. */
export type PanelTab = "tree" | "controls";

const TABS: PanelTab[] = ["tree", "controls"];

export function inspectorOpen(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(OPEN_KEY) === "1";
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
