/// <reference types="vite/client" />
// THE CARD TABLE ON ITS OWN URL — no hub, no shelf, no route. The room is `?room=CODE` and the
// address is rewritten once the server has named the table, so a reload comes back to it.
//
// This file exists to prove the game is standalone rather than to claim it: everything it does is
// four lines, and none of them reaches for anything the hub owns.

import { ensureAccount } from "@crossade/wire";
import { startCards } from "./index.js";

const app = document.querySelector<HTMLElement>("#app");

let stop: (() => void) | undefined;
// AN ACCOUNT FIRST, THEN THE TABLE. A desk joined before the device has a name joins as a guest and
// keeps that seat under a guest's name for the whole session — and a reload then comes back as
// somebody else, to a table that still has the first one sitting at it.
//
// NOT A TOP-LEVEL AWAIT: this app is built for the phones it is for (safari14 among them), and a
// module that awaits at its top level does not load there at all.
void ensureAccount().then(() => {
  stop = app ? startCards(app) : undefined;
});

// Dev only: tear the previous table down before a hot update mounts the next. Without it every edit
// STACKS another canvas, another frame loop and another socket on the page — the stale ones keep
// ticking and keep eating input, which reads as lag rather than as the leak it is.
if (import.meta.hot) {
  import.meta.hot.dispose(() => stop?.());
}
