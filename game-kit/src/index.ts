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
// THE RENDERER IS A SECOND DOOR (`game-kit/pixi`), on purpose. Importing `pixi.js` reaches for
// a canvas context at module load, so re-exporting the painter from here would pull a WebGL
// dependency into every consumer — including rules running on a server and every headless
// test. Taking the renderer is a decision, and it looks like one.
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

export { allAtoms, classOf, defineAtom, type Atom, type AtomDef, type InheritClass, type Requirement } from "./core/atom.js";

// ---- core: the atoms ---------------------------------------------------------------------
// The load-bearing ladder, in dependency order. Each one is a separate import so a consumer
// can see, from this list alone, what the kit knows how to be.
export { Bounded, extentOf, footprint, outlineOf, type BoundedFields, type Point, type Shape } from "./core/atoms/bounded.js";
export { Transformable, resolveZ, type TransformableFields } from "./core/atoms/transformable.js";
export {
  Container,
  contentExtent,
  layoutRecord,
  placeChildren,
  registerLayout,
  type ContainerFields,
  type LayoutChild,
  type LayoutRecord,
} from "./core/atoms/container.js";
export { freeLayout, installStockLayouts, rowLayout, type RowOptions } from "./core/atoms/layouts.js";
export {
  Surfaced,
  areaOf,
  paintable,
  resolveAlign,
  resolveFit,
  DEFAULT_ALIGN,
  DEFAULT_FIT,
  type Align,
  type Fit,
  type SurfacedFields,
} from "./core/atoms/surfaced.js";
// `InheritClass` comes from `atom.js` above: the rule is declared with the field it governs.
export { contextFor, nearestAlongChain, ownValue, sumAlongChain, type ResolveContext } from "./core/resolve.js";
export { inspect, type InspectNode } from "./core/inspect.js";
export { DEFAULT_VIEWER, withViewer, type ThemeName, type ViewerSettings } from "./core/viewer.js";

// ---- render: pixels ---------------------------------------------------------------------
export { mount, HUD_UNIT_FRACTION, type Host, type Viewport } from "./render/host.js";
export { attachPainter } from "./render/stage.js";
export { boundsMarks, scenePlan, originsOf, type Mark, type PlanInput, type Quad } from "./render/scenePlan.js";
export { type Painter } from "./render/painter.js";
export {
  installStockSurfaces,
  registerSurface,
  surfaceNames,
  surfaceRecord,
  type SurfaceRecord,
} from "./render/surfaces.js";
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
