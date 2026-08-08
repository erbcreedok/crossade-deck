// INSPECT — the ONE door the inspector panel goes through.
//
// Storybook's measure and outline addons work on DOM boxes; our whole scene is a single
// <canvas>, so to them it is one opaque element. Our own tooling is therefore not a
// convenience but the only option — and on the Node and Root scenes, where nothing is drawn
// at all, it is the only way those scenes are scenes.
//
// The panel must never walk the tree itself or reach into engine internals: a second
// traversal drifts from the first. This is a pure function over the same data the renderer
// uses, so a guard can assert the panel shows nothing the model does not have.

import { classOf, requirementLabel } from "./atom.js";
import { caps, isRoot, starved, walk, type Node } from "./node.js";
import { type InheritClass } from "./resolve.js";

export interface InspectField {
  readonly key: string;
  readonly value: string;
  readonly cls: InheritClass;
  /** Where the value came from, when that is not obvious. */
  readonly from?: string;
}

export interface InspectNode {
  readonly id: string;
  readonly depth: number;
  readonly isRoot: boolean;
  readonly atoms: readonly string[];
  /** Composed by the author but absent: the requirement is missing. */
  readonly absent: readonly string[];
  readonly fields: readonly InspectField[];
  readonly childCount: number;
}

export function inspect(root: Node): InspectNode[] {
  const out: InspectNode[] = [];
  walk(root, (n, depth) => {
    out.push({
      id: n.id,
      depth,
      isRoot: isRoot(n),
      atoms: [...caps(n)].sort(),
      absent: starved(n).map((d) => `${d.name} (needs ${requirementLabel(d)})`),
      fields: fieldsOf(n),
      childCount: n.children.length,
    });
  });
  return out;
}

/**
 * Every field of every present atom, flattened. Values are stringified here and nowhere
 * else, so the panel never has to guess how to print one.
 */
function fieldsOf(n: Node): InspectField[] {
  const out: InspectField[] = [];
  for (const name of [...caps(n)].sort()) {
    const atom = n.atoms.get(name)!;
    for (const [key, value] of Object.entries(atom.fields)) {
      // The class is READ from the atom, never assumed. It used to be hard-coded `own` here,
      // which was true only while no atom had an inherited field — and would have gone on
      // reading true, silently, the moment one did.
      out.push({ key: `${name}.${key}`, value: format(value), cls: classOf(name, key) ?? "own" });
    }
  }
  return out;
}

function format(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
