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
  cloneTree,
  compose,
  contains,
  decompose,
  fieldsOf,
  isRoot,
  localIds,
  node,
  remove,
  reorder,
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
  reflect,
  rotate,
  scale,
  type Transform,
  type Vec,
} from "./core/transform.js";
export { Bounded, extentOf, footprint, outlineOf, type BoundedFields, type PathSegment, type Point, type Shape } from "./core/atoms/bounded.js";
// What a path can do: be built from places, arrive from a drawing tool, and be moved.
export { fromSvgPath, joinPath, polyline, transformShape, type ShapeTransform } from "./core/path.js";
export { Transformable, resolveAngle, resolveZ, type TransformableFields } from "./core/atoms/transformable.js";
// Whose axes a turn is measured in. `viewer` severs the chain — the billboard a caption needs.
export { Oriented, orientationOf, type OrientedFields } from "./core/atoms/oriented.js";
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
  type Settle,
} from "./core/atoms/container.js";
export { freeLayout, installStockLayouts, rowLayout, type LayoutAlign, type RowOptions } from "./core/atoms/layouts.js";
// What a zone does to an arriving load, grain by grain: derive from the arrangement, stamp a fixed
// value, or keep what came in. Records in a registry, so a game's own answer costs no branch here.
export {
  derive,
  down,
  grainRecord,
  installStockGrains,
  keep,
  Poser,
  registerGrain,
  registerSide,
  registerWatched,
  resetGrains,
  restPose,
  sideRecord,
  stamp,
  watchedRecord,
  up,
  type CarriedPose,
  type GrainInput,
  type GrainRecord,
  type GrainRule,
  type LaidPose,
  type PoserFields,
  type RestPose,
  type SideInput,
  type SideRecord,
  type WatchedInput,
  type WatchRecord,
} from "./core/atoms/pose.js";
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
// A free angle a HAND set, and where it lands when the fingers go. Not `Tiltable`: that is a tap
// between a few declared stops, this is anything in between, and both write the one angle.
export {
  Rotatable,
  restAngle,
  rotatable,
  onReleaseOf,
  type OnRelease,
  type RotatableFields,
} from "./core/atoms/rotatable.js";
export { Focusable, focusable, type FocusableFields } from "./core/atoms/focusable.js";
// A control that answers a finger: what it WEARS hovered and held, and how deep it sinks. The
// meaning of the press is `Valued`, read by the consumer — this atom is the look and the depth.
export { Pressable, pressableOf, wearPress, type PressableFields } from "./core/atoms/pressable.js";
export { Private, visibleTo, type PrivateFields } from "./core/atoms/private.js";
// Grip is privacy's permission twin: which seats may LIFT a subtree, the open table liftable by all.
export { Grippable, grippableBy, type GrippableFields } from "./core/atoms/grippable.js";
// The shadow and the one light: a caster declares WHICH contour falls; the root's lamp says where.
export { castsShadow, ShadowCaster, shadowFrom, type ShadowCasterFields } from "./core/atoms/shadow.js";
export { faceOf, Rollable, rollable, setFace, sidesOf, withFace, type RollableFields } from "./core/atoms/rollable.js";
export { DEFAULT_LIGHT, DEFAULT_SHADOW, Lit, lightVector, shadowOf, type Frame, type Light, type LitFields, type Shadow } from "./core/atoms/lit.js";
// The invite: what a willing zone wears while a drag it would take is in flight. The Acceptor's
// verdict decides (`willingZones`); a game with function-rules picks zones itself and uses the
// low door (`wearInvite`). Grab dresses, release undresses — the closure is the whole protocol.
export { Inviting, inviteOf, wearInvite, type InvitingFields } from "./core/atoms/inviting.js";
export { wearInvites, willingZones } from "./core/invite.js";
// The card turn, as data: a recipe name, a turn count (parity, summed), a reflection axis, a back
// surface. What the turn DOES is a recipe in `render/flips.ts`; the engine mixes it in blind.
export { facing, Flippable, ownFacing, setFacing, type Facing, type FlippableFields } from "./core/atoms/flippable.js";
export { contentSwap, flipNames, flipRecord, flipEffect, installStockFlips, registerFlip, resetFlips, type Flip } from "./render/flips.js";
// A runtime layer mixed over the surface: a highlight, a dim, a censor. Data on the atom, look in
// a recipe, reach on the inheritance class — `self` this face, `cast` the whole subtree.
export { Coated, hasCoat, NO_COAT, type Coat, type CoatedFields } from "./core/atoms/coated.js";
// The card tap: a turn to one of a few discrete angle stops, the runtime holding which stop.
export { Tiltable, tiltAngle, tiltStops, nextTilt, type TiltableFields } from "./core/atoms/tiltable.js";
// The context menu that emerges from what a node IS: a verb per capability, resolved from a registry.
export {
  actionNames,
  actionRecord,
  actionsOf,
  installStockActions,
  perform,
  registerAction,
  type Action,
  type ActionRecord,
} from "./core/actions.js";
// `InheritClass` comes from `atom.js` above: the rule is declared with the field it governs.
// The whole drop as one PLAN: grab · grip · keeps · accept · occupied composed, mutating nothing.
export { applyMove, planMove, type MoveBlock, type MovePlan, type MoveRequest } from "./core/move.js";
// A move short of AUTHORITY, not of form: the record it hangs as, the two ends it can reach, and
// what stays locked while it does. Who asks and how is the consumer's — see `core/pending.ts`.
export { answer, askFor, locks, type Answer, type AskOptions, type Berth, type Outcome, type Pending } from "./core/pending.js";
export { contextFor, nearestAlongChain, ownValue, sumAlongChain, type ResolveContext } from "./core/resolve.js";
export { inspect, type InspectNode } from "./core/inspect.js";
// What ONE SEAT is shown: the truth minus what its eyes are denied. A projection is a COPY, so
// several screens can watch one board without eating each other's view — see `core/project.ts`.
export { project } from "./core/project.js";
export { DEFAULT_VIEWER, withViewer, type ThemeName, type ViewerSettings } from "./core/viewer.js";

// ---- render: pixels ---------------------------------------------------------------------
export { mount, HUD_UNIT_FRACTION, type Host, type Viewport } from "./render/host.js";
// The native gestures a browser puts on top of a canvas — off the glass by `mount`, off the page
// only when a standalone asks (a catalog page is prose, and prose is meant to be selectable).
export { holdTheGlass, holdThePage } from "./render/native.js";
export { attachPainter, renderFrame } from "./render/stage.js";
// The motion runtime — the one clock. Use `attachMotion` instead of `attachPainter` on a scene that
// should ease its cards to rest instead of teleporting; the pure settle math rides in `core/motion`.
export {
  attachMotion,
  type CarryItem,
  type CarryOptions,
  type Clock,
  type LaunchOptions,
  type MotionOptions,
  type Motions,
  type RollOptions,
  type ShuffleOptions,
  type SlideOptions,
  type WallHit,
} from "./render/animator.js";
// How a reorder LOOKS: the recipes a shuffle plays (riffle/overhand/wash/shake), a registry like flips.
export {
  installStockShuffles,
  overhand,
  registerShuffle,
  resetShuffles,
  riffle,
  shake,
  shuffleNames,
  shuffleRecipe,
  wash,
  type OverhandOptions,
  type RiffleOptions,
  type ShakeOptions,
  type ShuffleBox,
  type ShuffleContext,
  type ShufflePose,
  type ShuffleReach,
  type ShuffleRecipe,
  type WashOptions,
} from "./render/shuffles.js";
export {
  DEFAULT_TUNING,
  easing,
  flipScale,
  installStockEasings,
  lerp,
  lerpTransform,
  registerEasing,
  resetEasings,
  sample,
  tune,
  type CarryTuning,
  type Easing,
  type Motion,
  type MotionTuning,
  type Sampled,
  type TuningPatch,
} from "./core/motion.js";
// Chance and flight, both pure: a seedable rng (a shuffle's and a die's truth) and the ballistics
// the runtime steps for `launch` (a screen-fall) and `slide` (a desk-slide with walls).
export { permutation, rollDie, seededRng, type Rng } from "./core/rng.js";
export {
  bodyAt,
  polar,
  slideRests,
  stepFall,
  stepSlide,
  velocityOf,
  type Body,
  type FallConfig,
  type SlideConfig,
  type Walls,
} from "./core/ballistic.js";
export {
  clampAbs,
  springAt,
  springSettled,
  SPRING_REST,
  stepSpring,
  type SpringConfig,
  type SpringState,
} from "./core/spring.js";
export {
  carry,
  installStockCarries,
  lean,
  looseCarry,
  registerCarry,
  resetCarries,
  rigidCarry,
  type CarryContext,
  type CarryStyle,
} from "./core/atoms/carry.js";
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
  type QuadText,
  type QuadImage,
  type QuadLayer,
  type QuadStroke,
} from "./render/scenePlan.js";
// The pointer seam: a glass point off an event, its units, and the topmost node under it — read off
// the same plan the painter drew. Every interactive scene needs it; none should write its own copy.
export { glassOf, pick, toUnits } from "./render/pointer.js";
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
// A control, assembled from one literal — and the press wiring the kit owns, because "down on me
// and up on me" means the same thing in every game there will ever be.
export { button, type ButtonSpec } from "./presets/button.js";
// The stock controls — the looks a button already has, so a button is one line.
export {
  installStockControls,
  lookFace,
  lookSurface,
  CONTROL_BAR,
  CONTROL_H,
  CONTROL_INSET,
  CONTROL_LABEL,
  CONTROL_LABEL_ON,
  lookLabel,
  CONTROL_LOOKS,
  CONTROL_W,
  iconSurface,
  skinSurface,
  type Skin,
  LARGE,
  MEDIUM,
  PILL,
  ROUND,
  SMALL,
  SQUARE,
  HELD,
  HOVER,
  QUIET,
  type ControlLook,
} from "./presets/controls.js";
// THE CAMERA — how a desk is LOOKED AT. Numbers only: it draws nothing, so everything under it
// stays checkable headless and rendering begins here (`docs/design/camera.md`).
export {
  Camera,
  wheelGoesToCamera,
  wheelPixels,
  wheelZoomFactor,
  FLING,
  ZOOM_FLING,
  TURN_FLING,
  INERTIA,
  NO_FLING,
  ZOOM_SENS,
  FREE_INPUT,
  LOCKED_INPUT,
  type CameraContent,
  type CameraInput,
  type Inertia,
  type CameraLimits,
  type CameraState,
  type Fling,
} from "./render/camera.js";
// The two gestures whose meaning is the same in every game there will ever be — a press, and the
// hand moving the view. Everything else a game wires itself out of `glassOf`/`toUnits`/`pick`.
export { wireButtons, type ButtonWiring, type Meaning } from "./render/buttons.js";
export { wireCamera, TWIST, type CameraControl, type CameraGestures, type Gesture } from "./render/cameraInput.js";
// The rest of the interface — each one a composition of atoms that already exist, never a new one.
export {
  badge,
  bottomOf,
  hud,
  knobAt,
  label,
  panel,
  sized,
  slider,
  toggle,
  toggles,
  topOf,
  valueAt,
  BADGE_H,
  HUD_MARGIN,
  KNOB,
  type Area,
  type BadgeSpec,
  type HudSpec,
  type LabelSpec,
  type PanelSpec,
  type SliderSpec,
  type ToggleSpec,
} from "./presets/widgets.js";
// TEXT. The kit cannot measure a glyph — a font lives in the browser — so measuring arrives as a
// PORT, and the plan stays the pure function every visual rule is checked through. `domTextMeasure`
// is the browser's answer to it; a test's answer is an object literal, exactly as for `Painter`.
export { domTextMeasure, type DomTextOptions, type FontWait } from "./render/domText.js";
export { layoutText, type LayoutRequest, type TextLayout, type TextLine } from "./render/textLayout.js";
// How big a box with words in it gets, and how much the words give way. One arithmetic, so a
// button, a drop zone, a nameplate and a badge cannot drift into four slightly different ones.
export { boxSize, captionScale, clampSize, type BoxFit, type BoxSpec, type CaptionFit, type FitAxis } from "./render/boxFit.js";
export { type FontSpec, type Glyphs, type TextMeasure } from "./render/textMetrics.js";
// A caption names a ROLE; what the role is worth is one registry entry, like a surface.
export { DEFAULT_TEXT, registerTextStyle, resetTextStyles, textStyle, textStyleNames, type TextStyle } from "./render/textStyles.js";
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
  type PaintLayer,
  type Stroke,
  type SurfaceRecord,
} from "./render/surfaces.js";
// A colour is a token name, a literal, or a parametric `{token, param}` — the infinite palette.
export { isParametric, type Paint, type ParametricPaint } from "./core/paint.js";
// The coats registry — the mirror of surfaces for the runtime layer: recipes by render shape, and
// the effect that mixes them. `installStockCoats` wires both, like every other `installStock*`.
export {
  coatEffect,
  coatNames,
  coatRecipe,
  installStockCoats,
  registerCoat,
  resetCoats,
  type CoatRecipe,
} from "./render/coats.js";
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
// A pile from one literal of data: the assembly every game's stacks share — seat, box, face,
// arrangement, and the four policies (grab · accept · invite · shadow), each optional by absence.
export { pile, type PileSpec } from "./presets/pile.js";
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
