// WHERE THE PLAYER IS, IN THE URL — so a reload puts them back, and Back goes back.
//
// The hash and not a path, deliberately: a path needs a server that rewrites every unknown URL to
// the index, and this app is served as static files from whatever directory it lands in. A hash
// costs nothing, works from a file:// copy, and is honest about being a client-side place.
//
// It is a NAME, not a state dump. `#klondike` says which game is open and nothing else — no scroll,
// no seed, no board. What a game does with its own progress is the game's business, and the day one
// wants to keep a board across a reload it will say so itself, in its own storage.
//
// `#durak?room=AB12` names the table (room) alongside the game. A room is part of the address
// — which table is open — not a state dump (it holds no hand, no score, no move history).

export type Place = {
  game?: string;
  room?: string;
};

/** The place (game and optional room) named by the current URL. */
export function placeOf(): Place {
  const raw = globalThis.location?.hash ?? "";
  const fragment = decodeURIComponent(raw.replace(/^#\/?/, "")).trim();
  if (!fragment) return {};

  const qIndex = fragment.indexOf("?");
  const gamePart = qIndex >= 0 ? fragment.slice(0, qIndex).trim() : fragment;
  if (!gamePart) return {};

  const queryPart = qIndex >= 0 ? fragment.slice(qIndex + 1) : "";
  const params = new URLSearchParams(queryPart);
  const room = params.get("room") || undefined;

  return room ? { game: gamePart, room } : { game: gamePart };
}

/** The game named by the current URL, or nothing when the shelf is showing. */
export function routeOf(): string | undefined {
  return placeOf().game;
}

/**
 * Write the place. `replace` rather than `push` on the first write of a session, so a reload does
 * not build a stack of identical entries; otherwise pushing is what makes the browser's own Back
 * button mean "leave the game", which is the behaviour a player already expects from every phone.
 */
export function goTo(id: string | undefined, how: "push" | "replace" = "push", room?: string): void {
  const hashPart = id ? `#${encodeURIComponent(id)}${room ? `?room=${encodeURIComponent(room)}` : ""}` : "";
  const url = `${globalThis.location.pathname}${globalThis.location.search}${hashPart}`;
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
