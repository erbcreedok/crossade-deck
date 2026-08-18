/// <reference types="vite/client" />
import { startHub } from "./hub/shell.js";

const chrome = document.querySelector<HTMLElement>("#chrome");
const stage = document.querySelector<HTMLElement>("#stage");
const stop = chrome && stage ? startHub(chrome, stage) : undefined;

// Dev only: tear the previous hub down before a hot update mounts the next. Without it every edit
// STACKS another canvas and its listeners on the page, the stale ones keep eating input, and the
// symptom reads as lag rather than as the leak it is. A production build has no `import.meta.hot`.
if (import.meta.hot) {
  import.meta.hot.dispose(() => stop?.());
}
