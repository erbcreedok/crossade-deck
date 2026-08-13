// THE PIXI DOOR — same reason game-kit itself splits a "./pixi" export off its pixi-free ".": the
// model door stays paintable by anything, so the interactive scene (which imports "game-kit/pixi")
// lives behind its own subpath instead of dragging Pixi into every consumer of the model.
export { startSolitaire } from "./scene.js";
