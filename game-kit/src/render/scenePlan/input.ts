// WHAT THE PLAN IS ASKED WITH. Its own file so the marks and the plan can both read it without one
// importing the other's machinery.

import { type Node, type NodeId } from "../../core/node.js";
import { type Transform } from "../../core/transform.js";
import { type ViewerSettings } from "../../core/viewer.js";
import { type TextMeasure } from "../textMetrics.js";

export interface PlanInput {
  readonly root: Node;
  /** Screen pixels per unit. */
  readonly unit: number;
  readonly width: number;
  readonly height: number;
  readonly viewer: ViewerSettings;
  /**
   * THE VIEW ITSELF, when something owns one — a camera's `transform()`.
   *
   * Absent, the plan builds the plain centred view it always did, which is what a game with no
   * camera wants and what every headless test uses. Present, it is the ONE door into coordinates:
   * nothing else adds an offset or reads a scale of its own (`docs/design/camera.md`).
   */
  readonly view?: Transform | undefined;
  /**
   * HOW FAR THE CAMERA IS LAID BACK, in degrees — the number the view's squash was built from.
   *
   * Handed over beside the matrix rather than dug out of it, because a matrix carrying a roll and a
   * squash cannot be taken apart into the two again. It is read for ONE thing: a node framed to the
   * viewer stands back up out of the tilted plane, and to stand it up the plan has to know how far
   * the plane went down. Absent (or zero) and every node lies on the desk, which is every scene
   * that has no camera in it.
   */
  readonly pitch?: number | undefined;
  /**
   * In-flight pose overrides, by node id, in ROOT-UNIT space (the same space `transformsOf`
   * answers in). Present only while a node is mid-settle: the motion runtime hands the plan the
   * node's CURRENT flight pose so it draws there instead of at its resting pose. Absent for a still
   * scene, so a plan with no motion is byte-for-byte the plan there always was. Leaf nodes only for
   * now — an override replaces a node's own absolute pose and its children are not carried with it.
   */
  readonly overrides?: ReadonlyMap<NodeId, Transform> | undefined;
  /**
   * Nodes in FLIGHT — carried by a finger, easing home, mid-flip. They paint AFTER every resting
   * node, because the eye expects the moving card on top of whatever it crosses, however tall the
   * pile it passes. An ORDERING hint only: the quad's `z` keeps reporting the resting height, so
   * inspection reads the tree's truth, and a group in flight keeps its own height order inside.
   */
  readonly raised?: ReadonlySet<NodeId> | undefined;
  /**
   * Nodes a FINGER is holding right now — the subset of `raised` that is genuinely off the desk.
   *
   * A shadow is HEIGHT, and a hand is the one thing that takes a piece UP rather than along. It says
   * nothing about WHERE the shadow goes — that is never in question, a shadow is under its piece
   * (`shade`) — only how FAR from it: a held piece is lifted off the desk by `lifted`. What the clock
   * has off the felt rides in `grounded` instead, at its own height.
   * Absent, nothing is lifted, which is what a still scene wants.
   */
  readonly carried?: ReadonlySet<NodeId> | undefined;
  /**
   * HOW HIGH ABOVE THE DESK the clock is holding each piece right now (root units) — a hop, a
   * throw's arc, a bounce that never leaves the felt at all (0). Like `carried`, this is a LENGTH
   * and not a place: the shadow is under the piece either way, and this says how far under.
   *
   * It is what makes a bouncing piece read as a bounce: the fall grows with the height, so the
   * shadow drops away as the die goes up and comes back under it as the die lands. A piece nobody
   * declared a height for is simply on the desk.
   */
  readonly grounded?: ReadonlyMap<NodeId, number> | undefined;
  /**
   * How wide a string is — the one thing the plan cannot compute and must be told (`textMetrics`).
   * Absent, no caption lays out and the plan is byte-for-byte the plan it was before text existed:
   * skipped, not thrown, exactly as an unregistered surface name is.
   */
  readonly measure?: TextMeasure | undefined;
  /** Timestamp in ms (Date.now()) to evaluate mark TTL against. */
  readonly now?: number | undefined;
}

/**
 * Every node that is both surfaced and has an area, in paint order.
 *
 * A node with `Bounded` and no `Surfaced` produces NOTHING here — not a faint box, not an
 * outline. That is the ladder's whole point: the box is real and invisible, and the only way
 * to see one is `boundsMarks` below, which an onlooker has to ask for.
 */
