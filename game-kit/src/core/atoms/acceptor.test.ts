import { describe, expect, it } from "vitest";
import { add, node } from "../node.js";
import { Bounded } from "./bounded.js";
import { Container } from "./container.js";
import { Acceptor, canAccept, wouldAccept } from "./acceptor.js";
import { rect } from "../../presets/shapes.js";

const box = () => Bounded({ bounds: rect(1, 1) });

describe("Acceptor", () => {
  it("atom.acceptor.needs-the-atom — a container with no Acceptor accepts nothing", () => {
    // Absence is the off switch: a plain container is not a zone, so it judges nobody and denies
    // rather than throwing. No judge, no entry.
    const zone = node("z1", Container({ layout: "free" }));
    expect(canAccept(zone, node("e1", box()))).toBe("deny");
    expect(wouldAccept(zone, node("e1b", box()))).toBe(false);
  });

  it("atom.acceptor.default-accepts-all — an Acceptor with no rule welcomes everything", () => {
    // The default rule is an empty `and`, which the algebra reads as allow. A zone narrows by
    // SETTING a rule; a bare Acceptor is the open door.
    const zone = node("z2", Container({ layout: "free" }), Acceptor());
    expect(canAccept(zone, node("e2", box()))).toBe("allow");
    expect(wouldAccept(zone, node("e2b", box()))).toBe(true);
  });

  it("atom.acceptor.reads-the-childcount — target.count comes from the real children", () => {
    // `subjectOf`/`targetOf` adapt the live tree, not a hand-built subject: the count a rule reads is
    // how many children the container actually holds right now.
    const zone = node("z3", Container({ layout: "free" }), Acceptor({ accept: { lt: ["target.count", 2] } }));
    add(zone, node("z3a", box()));
    expect(canAccept(zone, node("e3", box()))).toBe("allow"); // holds 1, under the limit
    add(zone, node("z3b", box()));
    add(zone, node("z3c", box()));
    expect(canAccept(zone, node("e3b", box()))).toBe("deny"); // holds 3, over the limit
  });

  it("atom.acceptor.can-reads-node-caps — the element's capabilities come from its atoms", () => {
    // `{ can: X }` reads the element's composed capabilities off the tree. A node built with the
    // atom answers allow; one without it answers deny — the capability check is real, not stubbed.
    const zone = node("z4", Container({ layout: "free" }), Acceptor({ accept: { can: "Bounded" } }));
    expect(canAccept(zone, node("e4", box()))).toBe("allow"); // has Bounded
    expect(canAccept(zone, node("e4b"))).toBe("deny"); // bare node, no Bounded
  });
});
