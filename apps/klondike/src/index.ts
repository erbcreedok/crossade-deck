// THE PUBLIC DOOR of this game — the one import a hub or any other shell comes through.
//
// A standalone entry (`main.ts`) and an embedding shell call the SAME function: a container in, a
// teardown out. That seam is also the shape an iframe or a separate page would take, so the day
// this game moves to its own URL, nothing on the other side of the door has to change.
//
// `main.ts` is deliberately NOT here. It grabs `#app` and wires hot reload — an entry, not an API,
// and nothing else should be able to import it.
export { startSolitaire } from "./solitaire/scene.js";
