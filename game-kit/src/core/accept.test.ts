import { describe, expect, it } from "vitest";
import {
  evaluate,
  needsRequest,
  previewAllows,
  validateRule,
  type AcceptContext,
  type AcceptRule,
  type Subject,
  type TargetSubject,
} from "./accept.js";

const subj = (o: Partial<Subject> = {}): Subject => ({ caps: new Set(), values: {}, traits: new Set(), ...o });
const ctx = (el: Partial<Subject> = {}, target: Partial<TargetSubject> = {}): AcceptContext => ({
  el: subj(el),
  target: { count: 0, ...target },
});

describe("AcceptRule", () => {
  it("accept.can-reads-a-capability — the most durable predicate, not tied to a sort's name", () => {
    // "no chip in a hand" really means "a hand holds what has a back" — a capability, not a label.
    const rule: AcceptRule = { can: "flip" };
    expect(evaluate(rule, ctx({ caps: new Set(["flip"]) }))).toBe("allow");
    expect(evaluate(rule, ctx({ caps: new Set(["drag"]) }))).toBe("deny");
  });

  it("accept.has-reads-a-trait — honest when the game truly is about a sort", () => {
    const rule: AcceptRule = { has: "card" };
    expect(evaluate(rule, ctx({ traits: new Set(["card"]) }))).toBe("allow");
    expect(evaluate(rule, ctx({ traits: new Set(["chip"]) }))).toBe("deny");
  });

  it("accept.flag-reads-runtime-state — 'eaten' is an ordinary value, read by the same machine", () => {
    const rule: AcceptRule = { flag: "eaten" };
    expect(evaluate(rule, ctx({ values: { eaten: true } }))).toBe("allow");
    expect(evaluate(rule, ctx({ values: { eaten: false } }))).toBe("deny");
    expect(evaluate(rule, ctx({ values: {} }))).toBe("deny"); // absent flag is not set
  });

  it("accept.eq-and-lt-over-paths — value rules of card games, relational", () => {
    expect(evaluate({ eq: ["el.values.rank", 7] }, ctx({ values: { rank: 7 } }))).toBe("allow");
    expect(evaluate({ eq: ["el.values.rank", 7] }, ctx({ values: { rank: 8 } }))).toBe("deny");
    expect(evaluate({ lt: ["target.count", 10] }, ctx({}, { count: 3 }))).toBe("allow");
    expect(evaluate({ lt: ["target.count", 10] }, ctx({}, { count: 12 }))).toBe("deny");
  });

  it("accept.eq-compares-two-paths — el against the pile's top", () => {
    // "same suit as the top" — both operands are paths, resolved on either side of the comparison.
    const rule: AcceptRule = { eq: ["el.values.suit", "target.top.values.suit"] };
    const top = subj({ values: { suit: "hearts" } });
    expect(evaluate(rule, ctx({ values: { suit: "hearts" } }, { count: 1, top }))).toBe("allow");
    expect(evaluate(rule, ctx({ values: { suit: "spades" } }, { count: 1, top }))).toBe("deny");
  });

  it("accept.string-literal-vs-path — a bare word is a value, an el./target. prefix is a path", () => {
    // "hearts" is a literal to compare against; only a prefix names a place to read.
    expect(evaluate({ eq: ["el.values.suit", "hearts"] }, ctx({ values: { suit: "hearts" } }))).toBe("allow");
    expect(evaluate({ eq: ["el.values.suit", "hearts"] }, ctx({ values: { suit: "spades" } }))).toBe("deny");
  });

  it("accept.missing-path-denies — a comparison with a field that is not there is a quiet no", () => {
    // The validator of the SPEC catches `el.values.race` in a game with no races; at runtime a
    // missing path is deny, never `ask` and never a throw. Refusal looks like silence.
    expect(evaluate({ eq: ["el.values.race", "orc"] }, ctx({ values: { rank: 1 } }))).toBe("deny");
  });

  it("accept.empty-pile-top-is-missing — target.top on an empty pile is a missing path, so deny", () => {
    // An empty pile has no top: `target.top.values.suit` is nothing to compare, so it denies. The
    // "empty foundation takes an ace" is written with target.count instead, which every pile has.
    const rule: AcceptRule = { eq: ["el.values.suit", "target.top.values.suit"] };
    expect(evaluate(rule, ctx({ values: { suit: "hearts" } }, { count: 0 }))).toBe("deny");
    const acePile: AcceptRule = {
      or: [{ eq: ["target.count", 0] }, { eq: ["el.values.suit", "target.top.values.suit"] }],
    };
    expect(evaluate(acePile, ctx({ values: { suit: "hearts" } }, { count: 0 }))).toBe("allow");
  });

  it("accept.and-deny-dominates — one deny sinks the whole conjunction", () => {
    const rule: AcceptRule = { and: [{ can: "drag" }, { has: "card" }] };
    expect(evaluate(rule, ctx({ caps: new Set(["drag"]), traits: new Set(["card"]) }))).toBe("allow");
    expect(evaluate(rule, ctx({ caps: new Set(["drag"]) }))).toBe("deny"); // no trait → deny wins
    expect(evaluate({ and: [] }, ctx())).toBe("allow"); // empty and welcomes everything
  });

  it("accept.or-allow-dominates — one allow lifts the whole disjunction", () => {
    const rule: AcceptRule = { or: [{ can: "hide" }, { has: "card" }] };
    expect(evaluate(rule, ctx({ traits: new Set(["card"]) }))).toBe("allow");
    expect(evaluate(rule, ctx({ caps: new Set(["drag"]) }))).toBe("deny");
    expect(evaluate({ or: [] }, ctx())).toBe("deny"); // empty or accepts nothing
  });

  it("accept.ask-survives-to-a-request — a lean-yes the server must confirm", () => {
    // `ask` is "the client cannot decide". Its inner deny still denies; otherwise it is `ask`, and a
    // request is born only if that `ask` reaches the top.
    const rule: AcceptRule = { ask: { eq: ["target.count", 0] } };
    expect(evaluate(rule, ctx({}, { count: 0 }))).toBe("ask");
    expect(evaluate(rule, ctx({}, { count: 3 }))).toBe("deny"); // inner deny is nothing to ask about
    expect(needsRequest(rule, ctx({}, { count: 0 }))).toBe(true);
    expect(needsRequest(rule, ctx({}, { count: 3 }))).toBe(false);
  });

  it("accept.preview-treats-ask-as-allow — a hover shows welcome, the request is what waits", () => {
    const rule: AcceptRule = { ask: { eq: ["target.count", 0] } };
    expect(previewAllows(rule, ctx({}, { count: 0 }))).toBe(true); // ask reads yes in preview
    expect(previewAllows(rule, ctx({}, { count: 3 }))).toBe(false); // a flat deny still says no
  });

  it("accept.not-flips-allow-and-deny — the ordinary negation, over form only", () => {
    const rule: AcceptRule = { not: { can: "flip" } };
    expect(evaluate(rule, ctx({ caps: new Set(["drag"]) }))).toBe("allow");
    expect(evaluate(rule, ctx({ caps: new Set(["flip"]) }))).toBe("deny");
  });

  it("accept.not-over-ask-is-refused — 'do not ask' has no meaning, so it is a build error", () => {
    expect(() => validateRule({ not: { ask: { can: "flip" } } })).toThrow();
    expect(() => validateRule({ not: { or: [{ can: "x" }, { ask: { has: "card" } }] } })).toThrow();
    expect(() => validateRule({ and: [{ not: { can: "flip" } }, { ask: { has: "card" } }] })).not.toThrow();
  });

  it("accept.a-rule-can-read-the-actors-seat — and the owner of the zone it is aimed at", () => {
    // Without these two paths "my own hand takes it, someone else's asks" is not writable as a RULE
    // at all: the difference would have to live in a runtime, where it stops travelling and stops
    // being the same for every client.
    const mine = { eq: ["actor.seat", "target.owner"] } as const;
    const ctx = { el: { caps: new Set<string>(), values: {}, traits: new Set<string>() }, target: { count: 0, owner: "south" }, actor: { seat: "south" } };
    expect(evaluate(mine, ctx)).toBe("allow");
    expect(evaluate(mine, { ...ctx, actor: { seat: "north" } })).toBe("deny");
  });

  it("accept.an-unsaid-actor-is-missing-not-empty — an old caller denies rather than passes", () => {
    const mine = { eq: ["actor.seat", "target.owner"] } as const;
    expect(evaluate(mine, { el: { caps: new Set<string>(), values: {}, traits: new Set<string>() }, target: { count: 0, owner: "south" } })).toBe("deny");
  });
});
