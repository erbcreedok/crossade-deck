// BINDING a host to a painter — the one line that turns a tree into pixels.
//
// Kept apart from both: the host owns the view and the viewport and knows nothing of drawing;
// the painter draws and knows nothing of resizing or of where a unit comes from. This is the
// seam where a consumer could put a different renderer entirely, which is the point of having
// a seam at all.

import { bakeable } from "../core/atoms/bakeable.js";
import { byId, type Node, type NodeId } from "../core/node.js";
import { type Transform } from "../core/transform.js";
import { type Host } from "./host.js";
import { type Painter } from "./painter.js";
import { bakePlan, boundsMarks, gridMarks, scenePlan } from "./scenePlan.js";
import { type TextMeasure } from "./textMetrics.js";

/**
 * Paint now, and again whenever the host says something changed — a resize, a viewer switch,
 * a new hud etalon. Returns the unsubscribe, which the caller owes the host on teardown.
 *
 * The plan is rebuilt from scratch each time rather than patched. At this size that is not a
 * cost worth optimising, and a diff between two plans is precisely the kind of bookkeeping
 * that goes wrong quietly.
 */
export interface PaintOptions {
  /**
   * Which nodes get their matrix folded into their geometry before the renderer sees it.
   *
   * DEFAULT: `bakeable` — ask the node. A node carrying `Bakeable` is baked, everything else
   * is drawn live, and nobody keeps a list. This is the shape the whole decision wants: a fact
   * about a card lives on the card, and the engine has a sane answer without being told one.
   *
   * A PREDICATE rather than a switch, because three named settings turned out to be three
   * special cases of one function, and the interesting cases were never among the three:
   *
   * ```ts
   * attachPainter(host, painter)                                    // ask each node
   * attachPainter(host, painter, { bake: () => true })              // everyone
   * attachPainter(host, painter, { bake: () => false })             // nobody
   * attachPainter(host, painter, { bake: (n) => bakeable(n) && !flying.has(n.id) })
   * attachPainter(host, painter, { bake: (n) => dashed(n) })        // only what a dash would spoil
   * ```
   *
   * It is handed the NODE, not an id: an id is a name, and naming every card to say "bake the
   * cards" is bookkeeping the kit should not make anyone do.
   *
   * The answer this is heading for is automatic — bake whatever is not moving — and the kit
   * will be able to say that itself the day movement is an atom. `Bakeable` is how a tree says
   * it in the meantime, and it is the same sentence, so nothing written today has to change.
   */
  readonly bake?: (node: Node) => boolean;
  /**
   * In-flight pose overrides, by node id, in root-unit space — the seam the motion runtime draws a
   * settle through. Absent for a still scene, which is every scene until something animates.
   */
  readonly overrides?: ReadonlyMap<NodeId, Transform> | undefined;
  /** Nodes in flight, painted after everything at rest — see `PlanInput.raised`. */
  readonly raised?: ReadonlySet<NodeId> | undefined;
  /** Nodes a finger is holding — their shadow travels with them, see `PlanInput.carried`. */
  readonly carried?: ReadonlySet<NodeId> | undefined;
  /** Nodes the clock is sliding ACROSS the desk, and how high each is — see `PlanInput.grounded`. */
  readonly grounded?: ReadonlyMap<NodeId, number> | undefined;
  /**
   * The glass keeps what it shows and only the FLYING quads (`raised`) are painted, over it, with
   * no clear: the trail of the old solitaire's cascade. Shadows and debug marks are left out of
   * such a frame — repainted every frame onto an uncleared glass, a translucent layer would
   * blacken in a dozen frames. Nothing here changes what the plan IS; it changes what is sent.
   */
  readonly retain?: boolean | undefined;
  /**
   * The ruler a caption is laid out against (`TextMeasure`). Absent, nothing with a `Labeled` draws
   * its words and every scene is exactly what it was before text existed — a consumer opts in by
   * handing one, the same way it opts into a renderer.
   */
  readonly measure?: TextMeasure | undefined;
  /**
   * THE VIEW, asked FRESH every frame — a camera's `transform()`.
   *
   * A getter and not a value, because a camera moves between frames while these options are handed
   * over once: a transform captured here would freeze the view at the moment the painter was
   * attached, and the desk would never pan again. Absent, the plain centred view.
   */
  readonly view?: (() => Transform) | undefined;
  /**
   * How far the camera is laid back, in degrees — asked fresh, beside the view it was built into.
   *
   * Two getters that have to agree, and they do because one camera answers both. It is not dug out
   * of the matrix instead, because a matrix carrying a roll and a squash cannot be taken back apart
   * into the two. The plan reads it for one thing: standing a `viewer`-framed node up out of the
   * tilted plane.
   */
  readonly pitch?: (() => number) | undefined;
}

/**
 * Paint ONE frame of the host's current tree. The shared draw step, so both the still painter and
 * the motion runtime turn a tree into pixels through the same eight lines rather than two copies
 * that drift the day one of them learns a new trick.
 */
export function renderFrame(host: Host, painter: Painter, options: PaintOptions = {}): void {
  const view = host.viewport();
  painter.resize(view.width, view.height);
  const input = {
    root: host.root,
    unit: host.unit(),
    width: view.width,
    height: view.height,
    viewer: host.viewer(),
    view: options.view?.(),
    pitch: options.pitch?.(),
    overrides: options.overrides,
    raised: options.raised,
    carried: options.carried,
    grounded: options.grounded,
    measure: options.measure,
  };
  // The grid FIRST, so it lies under the outlines rather than over them: a ruler drawn on
  // top of the thing being measured hides the very edge a reader is looking for.
  const whole = scenePlan(input);
  const retain = options.retain === true;
  const plan = retain ? whole.filter((q) => q.layer !== "shadow" && options.raised?.has(q.id)) : whole;
  const bake = options.bake ?? bakeable;
  const drawn = bakePlan(plan, (quad) => {
    // A quad whose node cannot be found is left LIVE: live is the mode that is always
    // correct, and guessing "bake" for something we could not ask about is how a stroke
    // silently stops scaling with its node.
    const owner = byId(host.root, quad.id);
    return owner ? bake(owner) : false;
  });
  const marks = retain ? [] : [...gridMarks(input), ...boundsMarks(input)];
  painter.draw(drawn, marks, host.viewer().theme, { retain });
}

export function attachPainter(host: Host, painter: Painter, options: PaintOptions = {}): () => void {
  const redraw = (): void => renderFrame(host, painter, options);
  redraw();
  return host.onChange(redraw);
}
