import { describe, expect, it } from "vitest";
import { add, fieldsOf, node } from "../node.js";
import { Acceptor } from "./acceptor.js";
import { Bounded } from "./bounded.js";
import { Coated, NO_COAT, type CoatedFields } from "./coated.js";
import { Container } from "./container.js";
import { Inviting, inviteOf, wearInvite, type InvitingFields } from "./inviting.js";
import { wearInvites, willingZones } from "../invite.js";
import { Valued } from "./valued.js";
import { rect } from "../../presets/shapes.js";

const seven = () => node("seven", Bounded({ bounds: rect(1, 1.4) }), Valued({ values: { rank: 7 } }));

function zone(id: string, rank: number, ...extra: Parameters<typeof node> extends [string, ...infer A] ? A : never) {
  return node(
    id,
    Bounded({ bounds: rect(1.4, 1.8) }),
    Container({ layout: "free" }),
    Acceptor({ accept: { eq: ["el.values.rank", rank] } }),
    ...extra,
  );
}

describe("the inviting zone", () => {
  it("atom.inviting.carries-a-coat — the look of willingness is data, with a visible stock default", () => {
    // A zone with a bare `Inviting()` already glows sensibly: the default is a stock ring in the
    // accent, not an empty coat a reader must fill before anything shows.
    const stock = fieldsOf<InvitingFields>(node("z1", Inviting()), "Inviting")?.coat;
    expect(stock?.recipe).toBe("ring");
    expect(inviteOf(node("z2", Inviting({ coat: { recipe: "wash", level: 0.4, tint: "alert" } })))?.recipe).toBe(
      "wash",
    );
    expect(inviteOf(node("z3"))).toBeUndefined();
  });

  it("atom.inviting.willing-zones — the rule decides, the atom dresses; either alone is nothing", () => {
    // Willingness is the ACCEPTOR's verdict; the invite is only what a willing zone WEARS. A
    // zone whose rule denies stays dark, a zone with no rule has no verdict to show, and a
    // willing zone without the atom simply has nothing to put on.
    const root = node("desk", Container({ layout: "free" }));
    const yes = zone("yes", 7, Inviting());
    const wrongRank = zone("no", 8, Inviting());
    const noRule = node("mute", Bounded({ bounds: rect(1, 1) }), Container({ layout: "free" }), Inviting());
    const noCoat = zone("bare", 7);
    for (const z of [yes, wrongRank, noRule, noCoat]) add(root, z);
    expect(willingZones(root, seven()).map((z) => z.id)).toEqual(["yes"]);
  });

  it("atom.inviting.wear-and-undo — the coat goes on the zone's own face and comes off exactly", () => {
    // The invite writes `Coated.self` — runtime state, exactly what that field is for — and the
    // undo puts back what stood there: a zone that already wore its own selection keeps it, and
    // the `cast` on the children is never touched.
    const cast = { recipe: "wash", level: 0.2, tint: "stageBg" };
    const prior = { recipe: "wash", level: 0.9, tint: "alert" };
    const dressed = zone("dressed", 7, Inviting(), Coated({ self: prior, cast }));
    const undo = wearInvite(dressed);
    expect(fieldsOf<CoatedFields>(dressed, "Coated")?.self.recipe).toBe("ring");
    expect(fieldsOf<CoatedFields>(dressed, "Coated")?.cast).toEqual(cast);
    undo();
    expect(fieldsOf<CoatedFields>(dressed, "Coated")?.self).toEqual(prior);
    expect(fieldsOf<CoatedFields>(dressed, "Coated")?.cast).toEqual(cast);

    // The one-call form: every willing zone dressed, one closure undresses them all.
    const root = node("desk2", Container({ layout: "free" }));
    const a = zone("a", 7, Inviting());
    const b = zone("b", 7, Inviting());
    add(root, a);
    add(root, b);
    const undressAll = wearInvites(root, seven());
    expect(fieldsOf<CoatedFields>(a, "Coated")?.self.recipe).toBe("ring");
    expect(fieldsOf<CoatedFields>(b, "Coated")?.self.recipe).toBe("ring");
    undressAll();
    expect(fieldsOf<CoatedFields>(a, "Coated")?.self ?? NO_COAT).toEqual(NO_COAT);
    expect(fieldsOf<CoatedFields>(b, "Coated")?.self ?? NO_COAT).toEqual(NO_COAT);
  });
});
