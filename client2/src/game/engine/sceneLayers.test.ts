import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { SceneLayers, LEVELS, levelOf, bucketByLevel, type Level } from "./sceneLayers";
import type { ShadowShape } from "../ui/Card";

describe("sceneLayers.levelOf", () => {
  it("план → уровень (удержание и драг — в слой драга)", () => {
    expect(levelOf("idle")).toBe("idle");
    expect(levelOf("floating")).toBe("floating");
    expect(levelOf("fan")).toBe("fan");
    expect(levelOf("drag")).toBe("drag");
    expect(levelOf("held")).toBe("drag");
  });
});

describe("sceneLayers.bucketByLevel", () => {
  const rect = (x: number): ShadowShape => ({ x, y: 0, hw: 1, hh: 1, rot: 0 });

  it("группирует силуэты по уровню", () => {
    const items: { level: Level; rect: ShadowShape }[] = [
      { level: "idle", rect: rect(1) },
      { level: "drag", rect: rect(2) },
      { level: "idle", rect: rect(3) },
    ];
    const b = bucketByLevel(items);
    expect(b.idle.map((r) => r.x)).toEqual([1, 3]);
    expect(b.drag.map((r) => r.x)).toEqual([2]);
    expect(b.floating).toEqual([]);
    expect(b.fan).toEqual([]);
  });

  it("пустой вход → все уровни пусты", () => {
    const b = bucketByLevel([]);
    expect(b.idle).toEqual([]);
    expect(b.drag).toEqual([]);
  });
});

describe("sceneLayers — тень под картами (issue #55)", () => {
  it("слой теней каждого уровня лежит НИЖЕ слоя карт того же уровня", () => {
    const content = new Container();
    const scene = new SceneLayers(content);
    // place() кладёт спрайт в cards[level]; тень уровня рисуется в свой (приватный) shadow-слой.
    // Инвариант: индекс карт-слоя больше индекса его тень-слоя → тень под картами, не поверх.
    for (const lvl of LEVELS) {
      const cardsIdx = content.getChildIndex(scene.cards[lvl]);
      // тень уровня — ближайший НЕ-карточный контейнер перед слоем карт (см. порядок addChild).
      const prev = content.children[cardsIdx - 1];
      const prevIsCardsLayer = LEVELS.some((l) => scene.cards[l] === prev);
      expect(prev, `перед cards.${lvl} должен стоять его тень-слой`).toBeTruthy();
      expect(prevIsCardsLayer, `перед cards.${lvl} стоит не карта, а тень`).toBe(false);
    }
  });

  it("уровни карт идут снизу вверх: idle < floating < fan < drag", () => {
    const content = new Container();
    const scene = new SceneLayers(content);
    const idx = (l: Level) => content.getChildIndex(scene.cards[l]);
    expect(idx("idle")).toBeLessThan(idx("floating"));
    expect(idx("floating")).toBeLessThan(idx("fan"));
    expect(idx("fan")).toBeLessThan(idx("drag"));
  });

  it("place кладёт спрайт в слой своего уровня (спрайт и тень со-локальны)", () => {
    const content = new Container();
    const scene = new SceneLayers(content);
    const sprite = new Container();
    scene.place(sprite, "floating");
    expect(sprite.parent).toBe(scene.cards.floating); // тот же уровень, что и levelOf("floating")
  });
});
