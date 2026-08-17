// NODE — the base of everything: an opaque id and a place in the tree. Nothing else.
//
// A bare node is VALID. It draws nothing, does nothing, and that is not a stub — it is the
// definition. Everything a node can do arrives as an atom.
//
// The word "element" is spoken language for a thing on the desk, and the name of a catalog
// root. There is no `isElement()` here and there must not be: systems ask for the atom they
// need (`Bounded` for a hit test, `Surfaced` for drawing). A category with no independent
// use is a word we retire.

import { type Atom, type AtomDef, requirementMet } from "./atom.js";

export type NodeId = string;

export interface Node {
  readonly id: NodeId;
  /** Null means nobody placed it — that is what makes a node a root. */
  parent: Node | null;
  readonly children: Node[];
  /** Composed atoms by name. Presence here is intent; caps() decides what actually exists. */
  readonly atoms: Map<string, Atom>;
}

/**
 * IDENTITY — given to a node, never minted by it.
 *
 * A node does NOT name itself. The id is an input, because the same node is looked at from
 * more than one place: a second player's device, a save file reopened tomorrow, a live mock
 * watching the same canvas. A counter hidden inside `node()` is unique within one tab and
 * nowhere else — and the failure it produces is the worst kind: a transaction arrives and
 * lands on a DIFFERENT existing node rather than on a missing one, in silence.
 *
 * So there are exactly two legitimate sources:
 *
 *   1. THE SPEC, for authored nodes — `"discard"`, `"hand"`. These are data, identical for
 *      everyone who loads the same board, which is what makes them agree. client2 did this
 *      by hand and it held.
 *   2. THE ORCHESTRATOR, for nodes born during play. Whoever owns the world hands out the
 *      name: the room in multiplayer, the save when restoring, a local allocator when the
 *      instance answers to nobody. One code path, three sources.
 *
 * The id stays OPAQUE either way. Nothing may parse it, split it, or compare it to a literal
 * — in client1 that magic (`id === "deck"`) is exactly what had to be torn out. A speaking
 * name is for a human reading the tree; the engine only ever compares it whole.
 */
export interface IdSource {
  next(prefix?: string): NodeId;
}

/**
 * The allocator for an instance that answers to nobody: a story, a test, a single-player
 * table. It is EXPLICIT on purpose — the day a room or a save starts handing out ids, the
 * call sites that must change are the ones naming this function, and they are greppable.
 */
export function localIds(prefix = "node"): IdSource {
  let counter = 0;
  return {
    next(ownPrefix = prefix) {
      counter += 1;
      return `${ownPrefix}:${counter.toString(36).padStart(3, "0")}`;
    },
  };
}

export function node(id: NodeId, ...atoms: Atom[]): Node {
  // AN ID IS HOW A NODE IS REFERRED TO, so there has to be something to say. The kit never
  // parses one — any hash, any compound string, any alphabet is fine (`guard.id-is-opaque`) —
  // but an empty one names nothing: it cannot be spoken between two clients, `byId` cannot
  // tell two of them apart, and a tree holding several was legal until the check above was
  // fixed. Loud at birth, where the caller is still on the stack.
  if (id === "") throw new Error("a node needs an id: the empty string names nothing");
  const n: Node = { id, parent: null, children: [], atoms: new Map() };
  for (const a of atoms) compose(n, a);
  return n;
}

/** Composing the same atom twice is a no-op overwrite, not a duplicate. */
export function compose(n: Node, atom: Atom): Node {
  n.atoms.set(atom.def.name, atom);
  return n;
}

/** Removing an atom removes it outright. There is no "disabled": absence IS the off switch. */
export function decompose(n: Node, name: string): Node {
  n.atoms.delete(name);
  return n;
}

/**
 * What the node actually HAS. An atom whose requirement is unmet is absent — not inert,
 * not disabled. Requirements may be alternatives, so this is a fixpoint: keep dropping
 * unsatisfied atoms until nothing changes.
 */
export function caps(n: Node): Set<string> {
  let present = new Set(n.atoms.keys());
  for (;;) {
    const next = new Set<string>();
    for (const name of present) {
      const def = n.atoms.get(name)!.def;
      if (def.requires.every((r) => requirementMet(r, present))) next.add(name);
    }
    if (next.size === present.size) return next;
    present = next;
  }
}

/** Composed by the author but absent because a requirement is missing. */
export function starved(n: Node): AtomDef[] {
  const have = caps(n);
  return [...n.atoms.values()].map((a) => a.def).filter((d) => !have.has(d.name));
}

export function fieldsOf<Fields extends object>(n: Node, name: string): Fields | undefined {
  return caps(n).has(name) ? (n.atoms.get(name)!.fields as Fields) : undefined;
}

// ---- the tree -------------------------------------------------------------------------
// Parent and children are BASE, not an atom: "a place in the tree" has two directions and
// one without the other is meaningless. `Container` will add HOW children are arranged
// (layout, hot, grab, occupied) — that they exist at all is not its business.

export function add(parent: Node, child: Node): Node {
  if (child === parent) throw new Error("a node cannot contain itself");
  if (child.parent) throw new Error(`node ${child.id} already has an owner`);
  if (contains(child, parent)) throw new Error("a cycle: the child already owns the parent");
  // A duplicate id is not a quirk to route around — it means two things claim to be one, and
  // every reference from then on is a coin toss. It must be LOUD here, where the cause is
  // still on the stack, rather than as a desync a week later. Replacing the older node
  // silently would be worse still: a plausible picture built on a lost identity.
  const clash = firstSharedId(rootOf(parent), child);
  // AGAINST `undefined`, NOT FOR TRUTH. `if (clash)` read false for the one id that is falsy —
  // the empty string — so a tree accepted two nodes both answering to `""` and every `byId`
  // after that was a coin toss. The check that exists to make a collision loud was the one
  // place it could happen in silence.
  if (clash !== undefined) throw new Error(`id ${clash} is already in this tree`);
  child.parent = parent;
  parent.children.push(child);
  return parent;
}

export function remove(parent: Node, child: Node): Node {
  const i = parent.children.indexOf(child);
  if (i >= 0) {
    parent.children.splice(i, 1);
    child.parent = null;
  }
  return parent;
}

/**
 * THE SAME CHILDREN IN A NEW ORDER — a shuffle's truth, a reordered hand, a pack cut. `order[k]` is
 * the CURRENT index of the child that will stand at `k`. Every child keeps its identity and its
 * owner; nothing is added or dropped, so a settle simply eases each one to where the layout now
 * seats it (`container.no-state-diffs`: this is one write on the tree, not a machine).
 *
 * Anything that is not a permutation of the current children is LOUD, in the tone of a duplicate
 * id in `add`: a shuffle that silently lost a card is a lost identity dressed as a plausible picture.
 */
export function reorder(parent: Node, order: readonly number[]): Node {
  const n = parent.children.length;
  if (order.length !== n) throw new Error(`reorder: ${order.length} indices for ${n} children`);
  const seen = new Set<number>();
  for (const i of order) {
    if (!Number.isInteger(i) || i < 0 || i >= n) throw new Error(`reorder: index ${i} is not a child of ${parent.id}`);
    if (seen.has(i)) throw new Error(`reorder: index ${i} named twice`);
    seen.add(i);
  }
  const before = parent.children.slice();
  for (let k = 0; k < n; k++) parent.children[k] = before[order[k]!]!;
  return parent;
}

/** The first id the incoming subtree shares with the destination tree, if any. */
function firstSharedId(destination: Node, incoming: Node): NodeId | undefined {
  const taken = new Set<NodeId>();
  walk(destination, (n) => void taken.add(n.id));
  let clash: NodeId | undefined;
  walk(incoming, (n) => {
    if (clash === undefined && taken.has(n.id)) clash = n.id;
  });
  return clash;
}

export function contains(owner: Node, maybeDescendant: Node): boolean {
  for (let p = maybeDescendant.parent; p; p = p.parent) if (p === owner) return true;
  return false;
}

/** A root is a node nobody placed. Not a type, not a flag — the absence of an owner. */
export function isRoot(n: Node): boolean {
  return n.parent === null;
}

export function rootOf(n: Node): Node {
  let r = n;
  while (r.parent) r = r.parent;
  return r;
}

/** Owners from the root down to and including the node. This is what resolution walks. */
export function chainOf(n: Node): Node[] {
  const chain: Node[] = [];
  for (let p: Node | null = n; p; p = p.parent) chain.unshift(p);
  return chain;
}

export function walk(root: Node, visit: (n: Node, depth: number) => void, depth = 0): void {
  visit(root, depth);
  for (const c of root.children) walk(c, visit, depth + 1);
}

/**
 * byId is a DERIVED index over the tree, never a second store: a node that left the tree
 * must not still be findable, or the two sources drift.
 */
export function byId(root: Node, id: NodeId): Node | undefined {
  let found: Node | undefined;
  walk(root, (n) => {
    if (n.id === id) found = n;
  });
  return found;
}
