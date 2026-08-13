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
    overrides: options.overrides,
  };
  // The grid FIRST, so it lies under the outlines rather than over them: a ruler drawn on
  // top of the thing being measured hides the very edge a reader is looking for.
  const plan = scenePlan(input);
  const bake = options.bake ?? bakeable;
  const drawn = bakePlan(plan, (quad) => {
    // A quad whose node cannot be found is left LIVE: live is the mode that is always
    // correct, and guessing "bake" for something we could not ask about is how a stroke
    // silently stops scaling with its node.
    const owner = byId(host.root, quad.id);
    return owner ? bake(owner) : false;
  });
  painter.draw(drawn, [...gridMarks(input), ...boundsMarks(input)], host.viewer().theme);
}

export function attachPainter(host: Host, painter: Painter, options: PaintOptions = {}): () => void {
  const redraw = (): void => renderFrame(host, painter, options);
  redraw();
  return host.onChange(redraw);
}
