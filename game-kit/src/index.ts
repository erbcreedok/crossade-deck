// THE PUBLIC API — the only door a standalone comes through.
//
// A consumer writes `import { node, mount } from "game-kit"` and never a path into `src`:
// the layout inside is ours to rearrange, and the day it moves, nobody's app breaks. That is
// also why this file is a list and not a barrel of `export *` — an accidental export is a
// promise made by mistake, and taking it back is a breaking change.
//
// The layers below it point one way only (guarded by `guard.layering`):
//   core    — the model: nodes, atoms, resolution, inspection. Knows nothing of pixels.
//   render  — pixels: the host that owns the view, and the theme tokens.
//   presets — the ready-made: the figures a designer asks for and the records they wear. Data
//             about what people draw, so it stands on both and neither stands on it.
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
// `compose` is already taken, by the thing that composes ATOMS into a node — the older and more
// central of the two meanings, so the geometry one yields rather than shadowing it.
export {
  apply,
  chain as chainTransforms,
  compose as composeTransforms,
  IDENTITY,
  invert,
  move,
  pose,
  rotate,
  scale,
  type Transform,
  type Vec,
} from "./core/transform.js";
export { Bounded, extentOf, footprint, outlineOf, type BoundedFields, type PathSegment, type Point, type Shape } from "./core/atoms/bounded.js";
// What a path can do: be built from places, arrive from a drawing tool, and be moved.
export { fromSvgPath, joinPath, polyline, transformShape, type ShapeTransform } from "./core/path.js";
export { Transformable, resolveZ, type TransformableFields } from "./core/atoms/transformable.js";
// The node's own answer to "fold my geometry, or hand it over as a matrix?" — see `attachPainter`.
export { Bakeable, bakeable, type BakeableFields } from "./core/atoms/bakeable.js";
export {
  Container,
  contentExtent,
  layoutRecord,
  placeChildren,
  registerLayout,
  slotAt,
  type ContainerFields,
  type LayoutChild,
  type LayoutRecord,
} from "./core/atoms/container.js";
export { freeLayout, installStockLayouts, rowLayout, type LayoutAlign, type RowOptions } from "./core/atoms/layouts.js";
export { Surfaced, areaOf, paintable, type SurfacedFields } from "./core/atoms/surfaced.js";
// A zone is a container that judges what may enter. The rule is DATA; the verdict is three-valued.
export { Acceptor, canAccept, wouldAccept, subjectOf, targetOf, type AcceptorFields } from "./core/atoms/acceptor.js";
export {
  evaluate,
  needsRequest,
  previewAllows,
  validateRule,
  type AcceptContext,
  type AcceptRule,
  type Operand,
  type Subject,
  type TargetSubject,
  type Verdict,
} from "./core/accept.js";
// Container policies, each a small atom over Container: what leaves, what displaces, what acts inside.
export {
  Grabber,
  grabAbove,
  grabFrom,
  grabOne,
  grabRule,
  grabTop,
  installStockGrabs,
  registerGrab,
  type GrabberFields,
  type GrabRule,
} from "./core/atoms/grab.js";
export {
  admitsOccupied,
  capture,
  Displacer,
  installStockOccupied,
  merge,
  occupiedRecord,
  registerOccupied,
  reject,
  resolveOccupied,
  swap,
  type DisplacerFields,
  type OccupiedOutcome,
  type OccupiedRecord,
} from "./core/atoms/occupied.js";
export { Keeper, keepsAllows, type KeeperFields } from "./core/atoms/keeps.js";
// Element data: the values a rule reads, the box it came from, the caption it carries, the mark
// that says it can be set into a slot.
export { Valued, type ValuedFields } from "./core/atoms/valued.js";
export { Owned, type OwnedFields } from "./core/atoms/owned.js";
export { Labeled, type LabeledFields } from "./core/atoms/labeled.js";
export { Placeable, placeable, type PlaceableFields } from "./core/atoms/placeable.js";
// Interaction & visibility: what can be dragged, focused, and who a private subtree is shown to.
export { Draggable, draggable, onRejectOf, type DraggableFields } from "./core/atoms/draggable.js";
export { Focusable, focusable, type FocusableFields } from "./core/atoms/focusable.js";
export { Private, visibleTo, type PrivateFields } from "./core/atoms/private.js";
// Grip is privacy's permission twin: which seats may LIFT a subtree, the open table liftable by all.
export { Grippable, grippableBy, type GrippableFields } from "./core/atoms/grippable.js";
// The card turn: which surface shows, as pure data — the front up, the back down.
export { Flippable, shownSurface, type FlippableFields } from "./core/atoms/flippable.js";
// The card tap: a turn to one of a few discrete angle stops, the runtime holding which stop.
export { Tiltable, tiltAngle, tiltStops, nextTilt, type TiltableFields } from "./core/atoms/tiltable.js";
// The context menu that emerges from what a node IS: a verb per capability, resolved from a registry.
export {
  actionNames,
  actionRecord,
  actionsOf,
  installStockActions,
  registerAction,
  type Action,
  type ActionRecord,
} from "./core/actions.js";
// `InheritClass` comes from `atom.js` above: the rule is declared with the field it governs.
// The whole drop as one PLAN: grab · grip · keeps · accept · occupied composed, mutating nothing.
export { planMove, type MoveBlock, type MovePlan, type MoveRequest } from "./core/move.js";
export { contextFor, nearestAlongChain, ownValue, sumAlongChain, type ResolveContext } from "./core/resolve.js";
export { inspect, type InspectNode } from "./core/inspect.js";
export { DEFAULT_VIEWER, withViewer, type ThemeName, type ViewerSettings } from "./core/viewer.js";

// ---- render: pixels ---------------------------------------------------------------------
export { mount, HUD_UNIT_FRACTION, type Host, type Viewport } from "./render/host.js";
export { attachPainter } from "./render/stage.js";
export {
  bakePlan,
  boundsMarks,
  gridMarks,
  scenePlan,
  transformsOf,
  viewTransform,
  type Mark,
  type PlanInput,
  type Quad,
  type QuadImage,
  type QuadLayer,
  type QuadStroke,
} from "./render/scenePlan.js";
// The one seam a runtime mechanic mixes itself in through: the engine folds this list and knows
// none of the mechanics by name. `flippable` and `coated` register into it; the core stays blind.
export {
  applyEffects,
  registerEffect,
  resetEffects,
  type Effect,
  type EffectOut,
  type FilterRef,
  type RuntimeCoat,
} from "./render/effects.js";
export { dashContour, perimeter, surfaceOutline, type DashOptions } from "./render/contour.js";
export { assetNames, assetRecord, registerAsset, resetAssets, type AssetRecord } from "./render/assets.js";
export {
  fitBox,
  DEFAULT_ALIGN,
  DEFAULT_FIT,
  type Align,
  type Fit,
  type Placed,
} from "./render/fitBox.js";
export { type Painter } from "./render/painter.js";
export {
  registerSurface,
  surfaceNames,
  surfaceRecord,
  type DashPattern,
  type LineCap,
  type LineJoin,
  type Paint,
  type PaintLayer,
  type Stroke,
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

// ---- presets: the ready-made ---------------------------------------------------------------
// The figures a designer asks for, as ordinary functions. A `Shape` has no sorts; these build
// one, so a new figure is a new function rather than a new branch in five files.
export { circle, ellipse, polygon, rect, roundedRect, star } from "./presets/shapes.js";
// A set's cards, expanded: one node per physical card, where Bounded·Surfaced·Flippable·Valued meet.
export { deck, type CardSpec, type DeckOptions } from "./presets/deck.js";
export {
  cascade,
  fan,
  stack,
  type CascadeOptions,
  type DealtPose,
  type FanOptions,
  type StackOptions,
} from "./presets/poses.js";
// A line, and the little tree an arrow actually is. The heads are a REGISTRY of SHAPES: a fifth
// one is a registration, not a case for anything to learn — and what it looks like is the record
// its node wears, exactly like every other node in the kit.
export {
  arrow,
  headNames,
  headShape,
  installStockHeads,
  line,
  outAndBack,
  path,
  registerHead,
  type ArrowSpec,
  type LineSpec,
} from "./presets/line.js";
export { installStockSurfaces } from "./presets/surfaces.js";
// Arrangements as functions, like `rowLayout`: each returns a still-nameless record, and the
// consumer's `registerLayout` call is what gives it a name.
export {
  gridLayout,
  radialLayout,
  slotsLayout,
  stackLayout,
  type GridOptions,
  type RadialOptions,
  type SlotsOptions,
  type StackLayoutOptions,
} from "./presets/layouts.js";
