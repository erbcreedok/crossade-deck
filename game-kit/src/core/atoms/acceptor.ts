// ACCEPTOR — the atom that makes a container a ZONE: it answers whether an element may enter.
//
// The rule is DATA (`AcceptRule`), evaluated by the pure machine in `core/accept.ts`. This atom
// carries the rule and adapts a live `Node` into the `Subject` the machine reads — nothing more.
// `occupied` (what happens to a sitter) is a SEPARATE concern and lives elsewhere: the rule says
// who may enter and is silent about the one already there.

import { defineAtom } from "../atom.js";
import { caps, fieldsOf, type Node } from "../node.js";
import {
  evaluate,
  previewAllows,
  type AcceptContext,
  type AcceptRule,
  type Subject,
  type TargetSubject,
  type Verdict,
} from "../accept.js";

export interface AcceptorFields {
  /** The predicate a drop is measured against. Empty `and` (the default) welcomes everything. */
  readonly accept: AcceptRule;
}

export const Acceptor = defineAtom<AcceptorFields>({
  name: "Acceptor",
  requires: ["Container"], // a zone is a container that also judges what may enter
  defaults: { accept: { and: [] } }, // no rule stated = accept all; narrowing is the whole point of setting one
  classes: { accept: "own" },
});

/** Shape of a `Valued`-like fields bag — read structurally so this compiles before that atom exists. */
interface ValuedLike {
  readonly values: Readonly<Record<string, unknown>>;
}
interface OwnedLike {
  readonly box: string;
}

/**
 * A node as the accept machine sees it. Reads what the tree ALREADY carries — capabilities always,
 * `values`/`box` from their atoms when present — and leaves the rest empty. A path into a source
 * that is not there resolves as missing, which the machine denies: exactly the canon answer, and it
 * grows real coverage as `Valued`, `Owned` and element sets arrive (NIGHT-DECISIONS.md).
 */
export function subjectOf(node: Node): Subject {
  const valued = fieldsOf<ValuedLike>(node, "Valued");
  const owned = fieldsOf<OwnedLike>(node, "Owned");
  const subject: {
    caps: ReadonlySet<string>;
    values: Readonly<Record<string, unknown>>;
    traits: ReadonlySet<string>;
    box?: string;
    set?: string;
  } = {
    caps: caps(node),
    values: valued?.values ?? {},
    traits: new Set(), // no trait atom yet — an honest empty set, so `has` denies until one exists
  };
  if (owned?.box !== undefined) subject.box = owned.box;
  return subject;
}

/** The container as a drop target: how many it holds, and its top (the LAST child — a pile grows up). */
export function targetOf(container: Node): TargetSubject {
  const kids = container.children;
  const target: { count: number; top?: Subject } = { count: kids.length };
  const last = kids[kids.length - 1];
  if (last) target.top = subjectOf(last);
  return target;
}

function contextFor(container: Node, el: Node): AcceptContext {
  return { el: subjectOf(el), target: targetOf(container) };
}

/**
 * The three-valued verdict for dropping `el` onto `container`. A container without an `Acceptor`
 * accepts nothing — no judge, no entry — rather than throwing: absence is the off switch.
 */
export function canAccept(container: Node, el: Node): Verdict {
  const fields = fieldsOf<AcceptorFields>(container, "Acceptor");
  if (!fields) return "deny";
  return evaluate(fields.accept, contextFor(container, el));
}

/** The preview answer a hover shows: welcome unless the verdict is a flat deny (`ask` reads yes). */
export function wouldAccept(container: Node, el: Node): boolean {
  const fields = fieldsOf<AcceptorFields>(container, "Acceptor");
  if (!fields) return false;
  return previewAllows(fields.accept, contextFor(container, el));
}
