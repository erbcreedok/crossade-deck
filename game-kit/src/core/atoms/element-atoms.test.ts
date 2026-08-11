import { describe, expect, it } from "vitest";
import { fieldsOf, node } from "../node.js";
import { Bounded } from "./bounded.js";
import { Container } from "./container.js";
import { Acceptor, canAccept } from "./acceptor.js";
import { Valued, type ValuedFields } from "./valued.js";
import { Owned, type OwnedFields } from "./owned.js";
import { Labeled, type LabeledFields } from "./labeled.js";
import { Placeable, placeable } from "./placeable.js";
import { rect } from "../../presets/shapes.js";

const box = () => Bounded({ bounds: rect(1, 1) });

describe("element data atoms", () => {
  it("atom.valued.carries-values — the element's own game data, as plain fields", () => {
    const card = node("v1", Valued({ values: { rank: 7, suit: "hearts" } }));
    expect(fieldsOf<ValuedFields>(card, "Valued")?.values).toEqual({ rank: 7, suit: "hearts" });
  });

  it("atom.valued.feeds-accept — a value rule reads Valued off the element through the tree", () => {
    // The second asker made real: `el.values.rank` resolves against a Valued node, so relational
    // accept rules work over live elements, not just hand-built subjects.
    const zone = node("v2", Container({ layout: "free" }), Acceptor({ accept: { eq: ["el.values.rank", 7] } }));
    expect(canAccept(zone, node("v2a", Valued({ values: { rank: 7 } })))).toBe("allow");
    expect(canAccept(zone, node("v2b", Valued({ values: { rank: 8 } })))).toBe("deny");
  });

  it("atom.owned.names-the-box — a reference to the box the element came from", () => {
    expect(fieldsOf<OwnedFields>(node("o1", Owned({ box: "deck" })), "Owned")?.box).toBe("deck");
  });

  it("atom.owned.feeds-accept — el.box resolves through Owned; an empty box is missing", () => {
    const zone = node("o2", Container({ layout: "free" }), Acceptor({ accept: { eq: ["el.box", "deck"] } }));
    expect(canAccept(zone, node("o2a", Owned({ box: "deck" })))).toBe("allow");
    expect(canAccept(zone, node("o2b", Owned({ box: "hand" })))).toBe("deny");
    expect(canAccept(zone, node("o2c", Owned()))).toBe("deny"); // empty box → el.box missing → deny
  });

  it("atom.labeled.carries-a-label — a caption already written in the viewer's language", () => {
    expect(fieldsOf<LabeledFields>(node("l1", Labeled({ label: "Attack" })), "Labeled")?.label).toBe("Attack");
  });

  it("atom.placeable.is-a-marker — presence says 'can be set into a slot', absence declines", () => {
    expect(placeable(node("p1", box(), Placeable()))).toBe(true);
    expect(placeable(node("p2", box()))).toBe(false); // has a footprint but is not placeable
  });
});
