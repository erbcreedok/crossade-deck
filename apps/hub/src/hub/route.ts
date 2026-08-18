// WHERE THE PLAYER IS, IN THE URL — so a reload puts them back, and Back goes back.
//
// The hash and not a path, deliberately: a path needs a server that rewrites every unknown URL to
// the index, and this app is served as static files from whatever directory it lands in. A hash
// costs nothing, works from a file:// copy, and is honest about being a client-side place.
//
// It is a NAME, not a state dump. `#klondike` says which game is open and nothing else — no scroll,
// no seed, no board. What a game does with its own progress is the game's business, and the day one
// wants to keep a board across a reload it will say so itself, in its own storage.

/** The game named by the current URL, or nothing when the shelf is showing. */
export function routeOf(): string | undefined {
  const raw = globalThis.location?.hash ?? "";
  const id = decodeURIComponent(raw.replace(/^#\/?/, "")).trim();
  return id.length > 0 ? id : undefined;
}

/**
 * Write the place. `replace` rather than `push` on the first write of a session, so a reload does
 * not build a stack of identical entries; otherwise pushing is what makes the browser's own Back
 * button mean "leave the game", which is the behaviour a player already expects from every phone.
 */
export function goTo(id: string | undefined, how: "push" | "replace" = "push"): void {
  const url = `${globalThis.location.pathname}${globalThis.location.search}${id ? `#${encodeURIComponent(id)}` : ""}`;
  if (how === "replace") globalThis.history.replaceState(null, "", url);
  else globalThis.history.pushState(null, "", url);
}

/**
 * Listen for the URL changing under us — the browser's Back and Forward, and a pasted link.
 *
 * BOTH events, because they answer different halves: `hashchange` fires when the fragment is edited
 * or a link is followed, `popstate` when history moves. A router that took only one of them works
 * until the day somebody presses the other.
 */
export function onRoute(listener: (id: string | undefined) => void): () => void {
  const fire = (): void => listener(routeOf());
  globalThis.addEventListener("hashchange", fire);
  globalThis.addEventListener("popstate", fire);
  return () => {
    globalThis.removeEventListener("hashchange", fire);
    globalThis.removeEventListener("popstate", fire);
  };
}
