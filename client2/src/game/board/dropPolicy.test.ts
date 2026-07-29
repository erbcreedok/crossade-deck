import { describe, expect, it } from "vitest";
import type { PileIdentity } from "./pileIdentity";
import {
  capabilityZoneRule,
  DEFAULT_DROP_POLICY,
  pileHasCapability,
  resolveDropChain,
  resolveMode,
  type DropRule,
} from "./dropPolicy";
import { hasTag } from "./tagQuery";

describe("дроп мимо зон — две оси как данные (#63)", () => {
  it("дефолты обязательны: merge off, keepSelection on, anchor primary", () => {
    expect(DEFAULT_DROP_POLICY).toEqual({ merge: "off", keepSelection: "on", mergeAnchor: "primary" });
  });

  const tags = new Set(["card", "suit:♣", "rank:7", "color:black"]);

  it("resolveMode: off→false, on→true независимо от карты", () => {
    expect(resolveMode("off", tags)).toBe(false);
    expect(resolveMode("on", tags)).toBe(true);
  });

  it("resolveMode custom: предикат над тегами карты (напр. «только ♣ сшиваются»)", () => {
    const onlyClubs = hasTag("suit:♣");
    expect(resolveMode("custom", tags, onlyClubs)).toBe(true); // ♣ — сшивается
    expect(resolveMode("custom", new Set(["card", "suit:♦"]), onlyClubs)).toBe(false); // ♦ — нет
  });

  it("resolveMode custom без предиката → off (безопасный дефолт)", () => {
    expect(resolveMode("custom", tags)).toBe(false);
  });

  it("старые состояния #61 = комбинации осей", () => {
    // домой=(off,on) остаться=(on,on) распустить=(on,off): merge решает дом/сшивка, keep — выделение.
    expect(resolveMode("off", tags)).toBe(false); // домой
    expect(resolveMode("on", tags)).toBe(true); // сшивка (остаться/распустить)
    expect(resolveMode("on", tags)).toBe(true); // keepSelection on (остаться)
    expect(resolveMode("off", tags)).toBe(false); // keepSelection off (распустить)
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
