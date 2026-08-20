/// <reference types="vite/client" />
import { holdThePage } from "game-kit";
import { startSolitaire } from "./solitaire/scene.js";

const app = document.querySelector<HTMLElement>("#app");
// THE PAGE IS THE GAME'S TOO. A canvas comes held by `mount`; the document around it does not,
// and on a phone that document is where the damage is: a pull at the left edge navigates BACK out
// of the game, a pull downwards rubber-bands it (and inside a Telegram webview, closes it), a
// double tap zooms, a long press raises a loupe over the card being held. Said once, here, before
// anything is mounted — the kit never says it on a consumer's behalf, because a page of prose
// wants none of this.
holdThePage();

const stop = app ? startSolitaire(app) : undefined;

// Dev only: tear the previous game down before a hot update mounts the next. Without this every edit
// STACKS another canvas, animator (its own frame loop) and pointer listeners on the page — the stale
// loops keep ticking and the stale listeners keep eating input, which reads as lag, stuck cards, and
// a drag that only animates once the churn settles. A production build has no `import.meta.hot`.
if (import.meta.hot) {
  import.meta.hot.dispose(() => stop?.());
}
