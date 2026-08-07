// THE PUBLIC API — the only door a standalone comes through.
//
// A consumer writes `import { node, mount } from "game-kit"` and never a path into `src`:
// the layout inside is ours to rearrange, and the day it moves, nobody's app breaks. That is
// also why this file is a list and not a barrel of `export *` — an accidental export is a
// promise made by mistake, and taking it back is a breaking change.
//
// The layers below it point one way only (guarded by `guard.layering`):
//   core   — the model: nodes, atoms, resolution, inspection. Knows nothing of pixels.
//   render — pixels: the host that owns the view, and the theme tokens.
//
// What is NOT here: words, localization, and the tools for looking at a tree. The kit carries
// no string a player could read and no notion of a language — a caption arrives already
// written, on the node that carries it. The inspector, the scene shell and the catalog live in
// `.storybook/`: they document the kit rather than being part of what ships in a game.

// ---- core: the model --------------------------------------------------------------------
export {
  add,
  byId,
  caps,
  chainOf,
  compose,
  contains,
  decompose,
  fieldsOf,
  isRoot,
  localIds,
  node,
  remove,
  rootOf,
  starved,
  walk,
  type IdSource,
  type Node,
  type NodeId,
} from "./core/node.js";

export { defineAtom, type Atom, type AtomDef, type Requirement } from "./core/atom.js";
export { contextFor, nearestAlongChain, ownValue, sumAlongChain, type InheritClass, type ResolveContext } from "./core/resolve.js";
export { inspect, type InspectNode } from "./core/inspect.js";
export { DEFAULT_VIEWER, withViewer, type ThemeName, type ViewerSettings } from "./core/viewer.js";

// ---- render: pixels ---------------------------------------------------------------------
export { mount, HUD_UNIT_FRACTION, type Host, type Viewport } from "./render/host.js";
export {
  accentWash,
  installTheme,
  themeCss,
  PALETTES,
  SCALE,
  s,
  t,
  type Palette,
  type ScaleStep,
} from "./render/theme.js";
