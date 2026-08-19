// THE EFFECTS LIST — the one seam the engine mixes a RUNTIME layer in through.
//
// A mechanic that changes what a node looks like at play time — a highlight that fades, a card
// that turns, a censored surface — is NOT a branch in `scenePlan`. Put the first one there and
// the second adds its own `if`, and the third, until the plan is a switchboard of every mechanic
// the kit will ever have and the walk cannot be read. This is the lesson `container`'s state
// machine taught in client1, applied before it can happen again.
//
// Instead the engine holds a LIST of small functions. Before a node is drawn it runs the list
// and asks each one the same three-part question: do you SWAP this node, do you SHIFT its pose,
// do you add a COAT over it? Each mechanic drops ONE function into the list, in its own file, and
// the code that folds the list — this file — is written once and never touched again. The core
// does not know which mechanics exist; `flippable` and `coated` register themselves.
//
// The fold is pure and runs in a plain unit test: nothing here reaches for a pixel.

import { type Node } from "../core/node.js";
import { type ResolveContext } from "../core/resolve.js";
import { compose, IDENTITY, type Transform } from "../core/transform.js";
import { type PaintLayer, type Stroke } from "./surfaces.js";

/**
 * A GPU filter, NAMED for the painter — never the pixels themselves. The kit stays honest about
 * where its rules can be held down: the name and its parameters are plain data a unit test can
 * read, and the shader that turns them into light lives in `render/pixi.ts`, the one file jsdom
 * cannot run. See CANONS §"the plan is pure".
 */
export interface FilterRef {
  readonly name: string;
  /** Serialisable knobs — a strength, a radius, a hue. Numbers only, so a filter crosses the wire. */
  readonly params: Readonly<Record<string, number>>;
}

/**
 * A named runtime OVERLAY — things DRAWN over the quad, where a filter is a shader over its pixels.
 *
 * The two are not one seam with a flag, because the painter does two different jobs for them: a
 * filter is hung on the box and the GPU reworks what is already there, an overlay is handed what
 * the box looks like and builds its own objects on top. The censor's dust is the first of these —
 * a thousand little squares, each one the colour of the spot it was born on, which no shader can
 * be handed and no wash can imitate.
 *
 * Like a filter it rides the plan as a NAME and numbers, so everything up to the glass stays a
 * pure function and the objects are built in the one file that owns Pixi.
 */
export interface OverlayRef {
  readonly name: string;
  /** Serialisable knobs. Numbers only, for the same reason a filter's are. */
  readonly params: Readonly<Record<string, number>>;
}

/**
 * One runtime contribution to a quad, spoken in the RECORD's own vocabulary: coats of paint over
 * the surface, an override stroke, a filter. A recipe returns these (see `render/coats.ts`); the
 * plan folds them into the quad it was already building. Every part is optional — a filter alone,
 * a single tinted layer, a ring — is a legal contribution.
 */
export interface RuntimeCoat {
  /** Extra layers, drawn OVER the surface's own — a highlight is above the paint it lights. */
  readonly layers?: readonly PaintLayer[];
  /** Replaces the surface's stroke when present: a selection ring is the border while it lasts. */
  readonly stroke?: Stroke;
  readonly filter?: FilterRef;
  /** Objects drawn over the quad, named for the painter — the censor's dust is the first one. */
  readonly overlay?: OverlayRef;
}

/**
 * What an effect answers for one node. `node` is the node to actually draw — the same one, or a
 * substitute (a card's other face). `pre` is a pose shift folded into its frame — a reflection, a
 * nudge — the identity when there is none. `coats` are runtime layers to mix in, absent when the
 * effect only moves or swaps.
 */
export interface EffectOut {
  readonly node: Node;
  readonly pre: Transform;
  readonly coats?: readonly RuntimeCoat[] | undefined;
}

export type Effect = (n: Node, ctx: ResolveContext) => EffectOut;

const EFFECTS: Effect[] = [];

/** A mechanic drops its one function here, on import. Registration order is play order. */
export function registerEffect(e: Effect): void {
  EFFECTS.push(e);
}

/** Test seam only — the list is process-wide and suites must not leak into each other. */
export function resetEffects(): void {
  EFFECTS.length = 0;
}

/**
 * Fold the whole list over one node. Empty list → the node exactly as handed in, at its own pose,
 * with no coats. Each effect sees what the one before it returned, so a swap chains and a shift
 * composes; coats accumulate in registration order, bottom-first like every other layer.
 */
export function applyEffects(n: Node, ctx: ResolveContext): EffectOut {
  let node = n;
  let pre: Transform = IDENTITY;
  const coats: RuntimeCoat[] = [];
  for (const effect of EFFECTS) {
    const out = effect(node, ctx);
    node = out.node;
    pre = compose(pre, out.pre);
    if (out.coats) coats.push(...out.coats);
  }
  return { node, pre, coats: coats.length ? coats : undefined };
}
