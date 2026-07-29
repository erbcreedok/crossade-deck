import { describe, expect, it } from "vitest";
import type { PileIdentity } from "./pileIdentity";
import {
  capabilityZoneRule,
  clearsSet,
  DEFAULT_DROP_POLICY,
  pileHasCapability,
  resolveDropChain,
  returnsHome,
  type DropRule,
} from "./dropPolicy";

describe("onDropOutside — семантика как данные", () => {
  it("дефолт — return-home", () => {
    expect(DEFAULT_DROP_POLICY.onDropOutside).toBe("return-home");
  });
  it("returnsHome только для return-home", () => {
    expect(returnsHome("return-home")).toBe(true);
    expect(returnsHome("stay")).toBe(false);
    expect(returnsHome("dissolve")).toBe(false);
  });
  it("clearsSet только для dissolve", () => {
    expect(clearsSet("dissolve")).toBe(true);
    expect(clearsSet("return-home")).toBe(false);
    expect(clearsSet("stay")).toBe(false);
  });
});

describe("resolveDropChain — приоритет элемент → зона → engine", () => {
  const accept: DropRule<unknown> = () => "accept";
  const reject: DropRule<unknown> = () => "reject";
  const pass: DropRule<unknown> = () => "pass";

  it("элемент-reject НЕ перебивается зоной/engine (нельзя нарушить)", () => {
    expect(resolveDropChain({}, [reject, accept, accept])).toBe(false);
  });
  it("элемент-accept — финал", () => {
    expect(resolveDropChain({}, [accept, reject])).toBe(true);
  });
  it("элемент pass → решает зона", () => {
    expect(resolveDropChain({}, [pass, accept, reject])).toBe(true);
    expect(resolveDropChain({}, [pass, reject, accept])).toBe(false);
  });
  it("все pass → fallback", () => {
    expect(resolveDropChain({}, [pass, pass, pass])).toBe(false);
    expect(resolveDropChain({}, [pass, pass, pass], true)).toBe(true);
  });
});

describe("слепые зоны через Pile", () => {
  const pile = (peekable: boolean): PileIdentity => ({
    size: 2,
    tagsAll: new Set(["card"]),
    tagsAny: new Set(["card"]),
    facing: "down",
    capabilities: { draggable: true, flippable: true, burnable: true, peekable },
  });

  it("pileHasCapability читает пересечение способностей", () => {
    expect(pileHasCapability(pile(true), "peekable")).toBe(true);
    expect(pileHasCapability(pile(false), "peekable")).toBe(false);
  });

  it("зона «подглядеть» принимает чисто-Peekable набор, гибрид — пропускает (pass, не reject)", () => {
    const peekZone = capabilityZoneRule(pile(true), "peekable");
    const peekZoneHybrid = capabilityZoneRule(pile(false), "peekable");
    expect(peekZone({})).toBe("accept"); // все Peekable
    expect(peekZoneHybrid({})).toBe("pass"); // карты+фишки → не Peekable → зона прозрачна
  });

  it("гибрид в цепочке: зона pass → engine решает исход (напр. return-home)", () => {
    const engineHome: DropRule<unknown> = () => "reject"; // «к себе не берём» → уйдёт в onDropOutside
    expect(resolveDropChain({}, [() => "pass", capabilityZoneRule(pile(false), "peekable"), engineHome])).toBe(false);
  });
});
