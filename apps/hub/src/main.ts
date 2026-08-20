/// <reference types="vite/client" />
import { holdThePage } from "game-kit";
import { startHub } from "./hub/shell.js";

const chrome = document.querySelector<HTMLElement>("#chrome");
const stage = document.querySelector<HTMLElement>("#stage");
// THE PAGE IS THE GAME'S TOO. A canvas comes held by `mount`; the document around it does not,
// and on a phone that document is where the damage is: a pull at the left edge navigates BACK out
// of the game, a pull downwards rubber-bands it (and inside a Telegram webview, closes it), a
// double tap zooms, a long press raises a loupe over the card being held. Said once, here, before
// anything is mounted — the kit never says it on a consumer's behalf, because a page of prose
// wants none of this.
holdThePage();

const stop = chrome && stage ? startHub(chrome, stage) : undefined;

// Dev only: tear the previous hub down before a hot update mounts the next. Without it every edit
// STACKS another canvas and its listeners on the page, the stale ones keep eating input, and the
// symptom reads as lag rather than as the leak it is. A production build has no `import.meta.hot`.
if (import.meta.hot) {
  import.meta.hot.dispose(() => stop?.());
}
