/// <reference types="vite/client" />
import { holdThePage } from "game-kit";
import { startHub } from "./hub/shell.js";
import { goTo, routeOf } from "./hub/route.js";
import { serverUrl } from "./account/server.js";

const chrome = document.querySelector<HTMLElement>("#chrome");
const stage = document.querySelector<HTMLElement>("#stage");
// THE PAGE IS THE GAME'S TOO. A canvas comes held by `mount`; the document around it does not,
// and on a phone that document is where the damage is: a pull at the left edge navigates BACK out
// of the game, a pull downwards rubber-bands it (and inside a Telegram webview, closes it), a
// double tap zooms, a long press raises a loupe over the card being held. Said once, here, before
// anything is mounted — the kit never says it on a consumer's behalf, because a page of prose
// wants none of this.
holdThePage();

/**
 * A Mini App opened from a table's own link (`t.me/bot?startapp=CODE`) carries the code in
 * `start_param`, not in the URL — Telegram controls the address bar, the bot only gets to pass
 * this one string. Resolved to a game with the same lookup a pasted `#chess?room=CODE` link would
 * use, and written to the route BEFORE the hub boots, so it opens the table directly and never
 * shows the shelf first.
 */
async function openStartParamTable(): Promise<void> {
  const code = (globalThis as any).Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (typeof code !== "string" || code.length === 0 || routeOf()) return;
  try {
    const res = await fetch(`${serverUrl()}/rooms/by-code/${encodeURIComponent(code)}`);
    if (!res.ok) return;
    const { game } = (await res.json()) as { game?: string };
    if (game) goTo(game, "replace", code);
  } catch {
    // No server, no code, no game — the shelf is still there to fall back on.
  }
}

await openStartParamTable();

const stop = chrome && stage ? startHub(chrome, stage) : undefined;

// Dev only: tear the previous hub down before a hot update mounts the next. Without it every edit
// STACKS another canvas and its listeners on the page, the stale ones keep eating input, and the
// symptom reads as lag rather than as the leak it is. A production build has no `import.meta.hot`.
if (import.meta.hot) {
  import.meta.hot.dispose(() => stop?.());
}
