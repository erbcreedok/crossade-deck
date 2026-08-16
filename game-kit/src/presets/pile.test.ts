import { describe, expect, it } from "vitest";
import { add, caps, fieldsOf, node } from "../core/node.js";
import { Bounded } from "../core/atoms/bounded.js";
import { Container, type ContainerFields } from "../core/atoms/container.js";
import { canAccept } from "../core/atoms/acceptor.js";
import { grabFrom, installStockGrabs, type GrabberFields } from "../core/atoms/grab.js";
import { type InvitingFields } from "../core/atoms/inviting.js";
import { type ShadowCasterFields } from "../core/atoms/shadow.js";
import { type TransformableFields } from "../core/atoms/transformable.js";
import { Valued } from "../core/atoms/valued.js";
import { willingZones } from "../core/invite.js";
import { pile } from "./pile.js";
import { rect } from "./shapes.js";

const card = (id: string, rank = 7) => node(id, Bounded({ bounds: rect(1, 1.4) }), Valued({ values: { rank } }));

describe("the pile preset", () => {
  it("preset.pile.assembles-what-was-asked — one literal of data, every atom in its place", () => {
    const p = pile("stock", {
      at: { x: -2, y: 1 },
      bounds: rect(1, 1.4),
      surface: "slot",
      layout: "column",
      grab: "top",
      accept: { eq: ["el.values.rank", 7] },
      invite: { recipe: "wash", level: 0.5, tint: "accent" },
      shadow: "silhouette",
    });
    expect(fieldsOf<TransformableFields>(p, "Transformable")?.at).toEqual({ x: -2, y: 1 });
    expect(fieldsOf<ContainerFields>(p, "Container")?.layout).toBe("column");
    expect(fieldsOf<GrabberFields>(p, "Grabber")?.grab).toBe("top");
    expect(fieldsOf<InvitingFields>(p, "Inviting")?.coat.recipe).toBe("wash");
    expect(fieldsOf<ShadowCasterFields>(p, "ShadowCaster")?.from).toBe("silhouette");
    expect(caps(p).has("Bounded")).toBe(true);
    expect(caps(p).has("Surfaced")).toBe(true);
    expect(caps(p).has("Acceptor")).toBe(true);
  });

  it("preset.pile.leaves-out-what-was-not-asked — absence is the refusal, not a switched-off flag", () => {
    // A bare pile is a container and NOTHING else: no seat, no box, no face, no grab, no rule,
    // no invite, no shadow. Every capability arrives only with the data that feeds it.
    const p = pile("bare", { layout: "free" });
    expect(caps(p).has("Container")).toBe(true);
    for (const absent of ["Transformable", "Bounded", "Surfaced", "Grabber", "Acceptor", "Inviting", "ShadowCaster"]) {
      expect(p.atoms.has(absent), `${absent} crept in unasked`).toBe(false);
    }
  });

  it("preset.pile.the-grab-is-the-registry — 'top' lifts the top card, like any Grabber", () => {
    installStockGrabs();
    const p = pile("waste", { layout: "free", grab: "top" });
    add(p, card("under"));
    add(p, card("over"));
    expect(grabFrom(p, "under")).toEqual(["over"]); // 'top' answers the top, whoever was touched
  });

  it("preset.pile.judges-and-invites-like-any-zone — the rule and the coat ride the same atoms", () => {
    // The preset is assembly, not behaviour: the pile it builds answers `canAccept` through its
    // Acceptor and lights through the same invite bridge every hand-built zone uses.
    const desk = node("desk", Container({ layout: "free" }));
    const sevens = pile("sevens", {
      layout: "free",
      accept: { eq: ["el.values.rank", 7] },
      invite: { recipe: "ring", level: 0.7, tint: "accent" },
    });
    add(desk, sevens);
    expect(canAccept(sevens, card("seven", 7))).toBe("allow");
    expect(canAccept(sevens, card("eight", 8))).toBe("deny");
    expect(willingZones(desk, card("seven", 7)).map((z) => z.id)).toEqual(["sevens"]);
  });
});
