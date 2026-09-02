import { describe, expect, it } from "vitest";
import { add, fieldsOf, node } from "../node.js";
import { Acceptor } from "./acceptor.js";
import { Bounded } from "./bounded.js";
import { Coated, NO_COAT, type CoatedFields } from "./coated.js";
import { Container } from "./container.js";
import { Inviting, inviteOf, wearInvite, wearKeen, type InvitingFields } from "./inviting.js";
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

  it("atom.inviting.aimed-is-a-second-sentence — where it MAY go, and where it WILL", () => {
    // Two questions, and a desk with more than one zone needs both answered differently. `coat` is
    // WHERE MAY THIS GO — every willing zone says so at the grab and goes on saying it for the whole
    // carry. `keen` is WHERE WILL IT GO IF I LET GO NOW, which is true of one zone at a time and
    // changes under the hand.
    const keen = { recipe: "wash", level: 0.22, tint: "accent" };
    const both = zone("both", 7, Inviting({ keen }));
    const off = wearKeen(both);
    expect(fieldsOf<CoatedFields>(both, "Coated")?.self, "the aimed coat, not the willing one").toEqual(keen);
    off();
    expect(fieldsOf<CoatedFields>(both, "Coated")?.self ?? NO_COAT).toEqual(NO_COAT);

    // A ZONE MAY SAY ONE AND NOT THE OTHER, and saying nothing has to mean nothing happens. An
    // empty coat put on is NOT the same as no coat put on: it would take the zone's own standing
    // look off for the length of the drag and hand it back afterwards, which is a flicker with a
    // cause nobody could find. This desk has one zone, where "there is a zone here" is not news.
    const prior = { recipe: "ring", level: 0.4, tint: "accent" };
    const aimOnly = zone("aim only", 7, Inviting({ coat: NO_COAT, keen }), Coated({ self: prior, cast: NO_COAT }));
    const putBack = wearInvite(aimOnly);
    // WHILE IT IS ON, which is the only moment the difference exists: an empty coat dressed and
    // undressed puts everything back, and a test that only looked afterwards would see nothing.
    expect(fieldsOf<CoatedFields>(aimOnly, "Coated")?.self, "willing says nothing, so nothing moved").toEqual(prior);
    putBack();
    expect(fieldsOf<CoatedFields>(aimOnly, "Coated")?.self, "and nothing to put back either").toEqual(prior);
    wearKeen(aimOnly);
    expect(fieldsOf<CoatedFields>(aimOnly, "Coated")?.self, "...and aimed says everything").toEqual(keen);

    // A bare `Inviting()` is silent on aiming: the stock ring is what a WILLING zone wears, and a
    // zone that never asked for an aim light must not light up under the hand.
    const plain = zone("plain", 7, Inviting());
    wearKeen(plain);
    expect(fieldsOf<CoatedFields>(plain, "Coated")?.self ?? NO_COAT, "nothing declared, nothing worn").toEqual(NO_COAT);
  });
});
