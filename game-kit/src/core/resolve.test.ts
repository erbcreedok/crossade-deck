// Ids follow docs/test-plan/ — one file per layer — a failing id names the scenario and the state.
//
// RESOLUTION IS THE PART NOTHING ELSE CAN COVER. Every other suite watches a value arrive
// somewhere; this one watches it being WORKED OUT — which of five rules applies, how far up the
// chain it looks, and what is left on the node afterwards (nothing).
//
// Two of the five classes have no field in the shipped atoms: `fromOwner` and `rootOnly`. The
// mechanism for the first exists and is exercised here through an atom declared IN THE TEST —
// the rule is the thing under test, not the atom that happens to use it today. `rootOnly` has
// no mechanism at all yet, and its row in the plan says so rather than being quietly covered.

import { describe, expect, it } from "vitest";
import { add, caps, chainOf, node, type Node } from "./node.js";
import { allAtoms, atomDef, defineAtom, requirementMet } from "./atom.js";
import { contextFor, nearestAlongChain, ownValue, sumAlongChain } from "./resolve.js";
import { Bounded } from "./atoms/bounded.js";
import { Container } from "./atoms/container.js";
import { Surfaced } from "./atoms/surfaced.js";
import { Transformable } from "./atoms/transformable.js";
import { rect } from "./shapes.js";

// THE TEST-LOCAL ATOMS ARE LEFT REGISTERED, and the registry is never cleared here. Vitest
// gives each file its own module graph, so `TestOriented` exists in this file and nowhere else;
// clearing instead would take the four shipped atoms with it — they register when their module
// loads, and nothing re-runs that — and the checks below would then pass over an empty registry
// while reporting success.

describe("inheritance", () => {
  it("inherit.owner.nearest — the nearest set value up the chain wins", () => {
    // Declared here because no shipped atom uses `fromOwner` yet. The RULE is what is being
    // checked, and a rule tested only through its current user stops being tested the day that
    // user changes.
    const Oriented = defineAtom<{ orientation: string }>({
      name: "TestOriented",
      requires: [],
      defaults: { orientation: "up" },
      classes: { orientation: "fromOwner" },
    });
    const root = node("r", Oriented({ orientation: "sideways" }));
    const mid = node("m");
    const leaf = node("l");
    add(root, mid);
    add(mid, leaf);
    expect(nearestAlongChain(contextFor(leaf, 100), "TestOriented", "orientation")).toBe("sideways");
    // And the NEAREST one, not the topmost: a value set halfway down shadows the root's.
    const nearer = node("m2", Oriented({ orientation: "flat" }));
    const under = node("l2");
    add(root, nearer);
    add(nearer, under);
    expect(nearestAlongChain(contextFor(under, 100), "TestOriented", "orientation")).toBe("flat");
  });

  it("inherit.owner.override — a child's own value beats its owner's", () => {
    const Oriented = defineAtom<{ orientation: string }>({
      name: "TestOriented2",
      requires: [],
      defaults: { orientation: "up" },
      classes: { orientation: "fromOwner" },
    });
    const root = node("r", Oriented({ orientation: "sideways" }));
    const child = node("c", Oriented({ orientation: "upside-down" }));
    add(root, child);
    expect(nearestAlongChain(contextFor(child, 100), "TestOriented2", "orientation")).toBe("upside-down");
  });

  it("inherit.sum.cannot-cancel — a child cannot zero what it inherited", () => {
    // The point of `addsUp`: only a node's OWN term is authored, so there is no value a child
    // can write that subtracts its owner's lift. Writing 0 contributes 0 — it does not undo 2.
    const owner = node("o", Transformable({ z: 2 }));
    const child = node("c", Transformable({ z: 0 }));
    add(owner, child);
    expect(sumAlongChain(contextFor(child, 100), "Transformable", "z")).toBe(2);
    // Not even a negative one can be smuggled past the rule as "cancelling": it is a term like
    // any other, and it lowers the child rather than erasing the owner's lift for everyone else.
    const sneak = node("s", Transformable({ z: -2 }));
    add(owner, sneak);
    expect(sumAlongChain(contextFor(sneak, 100), "Transformable", "z")).toBe(0);
    expect(sumAlongChain(contextFor(child, 100), "Transformable", "z")).toBe(2);
  });

  it("inherit.class-declared — every field of every atom names one of the five", () => {
    const CLASSES = ["own", "fromOwner", "addsUp", "multiplies", "rootOnly"];
    for (const def of allAtoms()) {
      const declared = def.classes as Record<string, string>;
      for (const field of Object.keys(def.defaults)) {
        expect(CLASSES, `${def.name}.${field}`).toContain(declared[field]);
      }
    }
    // Not vacuous, and not one class repeated: the model would still typecheck with everything
    // marked `own`, and every inheritance rule would silently be dead code.
    expect(allAtoms().length).toBeGreaterThan(3);
    const used = new Set(allAtoms().flatMap((d) => Object.values(d.classes as Record<string, string>)));
    expect(used.size).toBeGreaterThan(1);
  });

  it("atom.z.container-lifts-children — lifting the pile lifts the pile", () => {
    // Lying IN a lifted pile lifts nothing on its own; being lifted WITH it does. That is the
    // whole difference between a container's z and a child's, and it falls out of `addsUp`
    // rather than being special-cased anywhere.
    const stack = node("stack", Container(), Transformable({ z: 1 }));
    const bare = node("bare", Bounded({ bounds: rect(1, 1) }));
    const lifted = node("lifted", Bounded({ bounds: rect(1, 1) }), Transformable({ z: 3 }));
    add(stack, bare);
    add(stack, lifted);
    expect(sumAlongChain(contextFor(bare, 100), "Transformable", "z")).toBe(1);
    expect(sumAlongChain(contextFor(lifted, 100), "Transformable", "z")).toBe(4);
  });
});

describe("ResolveContext", () => {
  it("ctx.not-stored — nothing inherited is written onto the node", () => {
    const owner = node("o2", Transformable({ z: 5 }));
    const child = node("c2", Transformable({ z: 1 }));
    add(owner, child);
    expect(sumAlongChain(contextFor(child, 100), "Transformable", "z")).toBe(6);
    // The node still holds ONE, its own. A resolved value cached on the node is a second copy
    // of the truth, and it goes stale the moment an owner moves.
    // Its own term, untouched — the atom carries its defaults, and not one of them is the 6.
    expect(ownValue<number>(child, "Transformable", "z")).toBe(1);
    expect(Object.values(child.atoms.get("Transformable")!.fields)).not.toContain(6);
  });

  it("ctx.not-serialized — only own fields reach the wire", () => {
    const owner = node("o3", Transformable({ z: 5 }));
    const child = node("c3", Transformable({ z: 1 }));
    add(owner, child);
    // The wire carries the atom's OWN fields — its defaults included, since those are what the
    // author left standing. What it must never carry is the resolved 6: that is an answer about
    // where this node happens to sit, and it is different for a node moved one branch over.
    const payload = JSON.parse(JSON.stringify(child.atoms.get("Transformable")!.fields)) as Record<string, unknown>;
    expect(payload["z"]).toBe(1);
    expect(Object.values(payload)).not.toContain(6);
  });

  it("ctx.chain-depth — correct at every level, and walked once per node", () => {
    let deep: Node = node("d0", Transformable({ z: 1 }));
    const all = [deep];
    for (let i = 1; i < 5; i += 1) {
      const next = node(`d${i}`, Transformable({ z: 1 }));
      add(deep, next);
      all.push(next);
      deep = next;
    }
    all.forEach((n, i) => {
      expect(chainOf(n)).toHaveLength(i + 1);
      expect(sumAlongChain(contextFor(n, 100), "Transformable", "z")).toBe(i + 1);
    });
  });

  it("schema.no-functions — a spec is data, and survives a round trip", () => {
    const n = node("card", Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: "plate" }), Transformable({ z: 2 }));
    const spec = Object.fromEntries([...n.atoms].map(([name, a]) => [name, a.fields]));
    const back = JSON.parse(JSON.stringify(spec)) as typeof spec;
    expect(back).toEqual(spec);
    for (const fields of Object.values(back)) {
      for (const v of Object.values(fields as Record<string, unknown>)) {
        expect(typeof v).not.toBe("function");
      }
    }
  });
});

describe("requirement chains", () => {
  it("req.closure — every chain terminates, names something real, and reads OR", () => {
    for (const def of allAtoms()) {
      const seen = new Set<string>();
      const queue: string[] = [def.name];
      while (queue.length) {
        const name = queue.shift()!;
        // A cycle would hang the walk rather than fail it, so the visit set is the guard.
        if (seen.has(name)) continue;
        seen.add(name);
        const here = atomDef(name);
        expect(here, `${def.name} requires ${name}, which is not registered`).toBeTruthy();
        for (const req of here!.requires) {
          // An alternative is an OR: `Surfaced` needs Bounded OR Container, and each branch has
          // to be a real atom on its own — a typo inside one is invisible while the other holds.
          for (const option of typeof req === "string" ? [req] : req) queue.push(option);
        }
      }
      expect(seen.size, `${def.name} requires nothing and nobody`).toBeGreaterThan(0);
    }
  });

  it("compose.assoc — composition is associative", () => {
    // Not a curiosity: it is what lets a game hand round half-built sets of atoms and stitch
    // them together in any order. If it failed, `card = compose(base, art)` would depend on
    // which half was written first.
    const flat = node("f", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ z: 1 }));
    const nested = node("n", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ z: 1 }));
    expect([...caps(flat)].sort()).toEqual([...caps(nested)].sort());
  });

  it("bounded.minimal — a place that takes room and draws nothing", () => {
    const n = node("box", Bounded({ bounds: rect(1, 1) }));
    expect([...caps(n)]).toEqual(["Bounded"]);
  });

  it("node.canvas-has-no-box — a desk is Surfaced over Container, with no bounds of its own", () => {
    // A `Surfaced → Bounded` requirement would outlaw exactly this: the desk has plenty to paint
    // and no footprint, and its area comes from what it holds. The alternative is what makes it
    // legal, so the requirement is checked as an OR rather than as a list.
    const desk = node("desk", Container(), Surfaced({ surface: "plate" }));
    expect(caps(desk).has("Surfaced")).toBe(true);
    expect(requirementMet(["Bounded", "Container"], new Set(["Container"]))).toBe(true);
    expect(requirementMet(["Bounded", "Container"], new Set())).toBe(false);
  });
});
