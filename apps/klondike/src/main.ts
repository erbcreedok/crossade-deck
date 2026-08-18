/// <reference types="vite/client" />
import { startSolitaire } from "./solitaire/scene.ts";

const app = document.querySelector<HTMLElement>("#app");
const stop = app ? startSolitaire(app) : undefined;

// Dev only: tear the previous game down before a hot update mounts the next. Without this every edit
// STACKS another canvas, animator (its own frame loop) and pointer listeners on the page — the stale
// loops keep ticking and the stale listeners keep eating input, which reads as lag, stuck cards, and
// a drag that only animates once the churn settles. A production build has no `import.meta.hot`.
if (import.meta.hot) {
  import.meta.hot.dispose(() => stop?.());
}
