// SPEC — serialization of a Node tree to/from JSON data.

import { atomDef } from "./atom.js";
import { add, compose, node, type Node } from "./node.js";

export interface NodeSpec {
  readonly id: string;
  readonly atoms: Record<string, object>;
  readonly children: NodeSpec[];
}

export function toSpec(n: Node): NodeSpec {
  const atoms: Record<string, object> = {};
  for (const [name, atom] of n.atoms) {
    atoms[name] = JSON.parse(JSON.stringify(atom.fields)) as object;
  }
  const children = n.children.map((c) => toSpec(c));
  return {
    id: n.id,
    atoms,
    children,
  };
}

export function fromSpec(spec: NodeSpec): Node {
  const n = node(spec.id);
  if (spec.atoms && typeof spec.atoms === "object") {
    for (const [name, rawFields] of Object.entries(spec.atoms)) {
      const def = atomDef(name);
      if (!def) {
        throw new Error(`unknown atom "${name}" on node "${spec.id}"`);
      }
      const fields = { ...def.defaults, ...(rawFields as object) };
      compose(n, { def, fields });
    }
  }
  if (Array.isArray(spec.children)) {
    for (const childSpec of spec.children) {
      add(n, fromSpec(childSpec));
    }
  }
  return n;
}

export function treeJson(n: Node): string {
  return JSON.stringify(toSpec(n));
}

export function treeFromJson(text: string): Node {
  const spec = JSON.parse(text) as NodeSpec;
  return fromSpec(spec);
}
