import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { SceneLayers, LEVELS, levelOf, bucketByLevel, type Level } from "./sceneLayers";
import type { ShadowShape } from "../ui/Card";

describe("sceneLayers.levelOf", () => {
  it("план → уровень (удержание и драг — в слой драга)", () => {
    expect(levelOf("rest")).toBe("rest");
    expect(levelOf("lifted")).toBe("lifted");
    expect(levelOf("fan")).toBe("fan");
    expect(levelOf("drag")).toBe("drag");
    expect(levelOf("held")).toBe("drag");
  });
});

describe("sceneLayers.bucketByLevel", () => {
  const rect = (x: number): ShadowShape => ({ x, y: 0, hw: 1, hh: 1, rot: 0 });

  it("группирует силуэты по уровню", () => {
    const items: { level: Level; rect: ShadowShape }[] = [
      { level: "rest", rect: rect(1) },
      { level: "drag", rect: rect(2) },
      { level: "rest", rect: rect(3) },
    ];
    const b = bucketByLevel(items);
    expect(b.rest.map((r) => r.x)).toEqual([1, 3]);
    expect(b.drag.map((r) => r.x)).toEqual([2]);
    expect(b.lifted).toEqual([]);
    expect(b.fan).toEqual([]);
  });

  it("пустой вход → все уровни пусты", () => {
    const b = bucketByLevel([]);
    expect(b.rest).toEqual([]);
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

  it("уровни карт идут снизу вверх: idle < lifted < fan < drag", () => {
    const content = new Container();
    const scene = new SceneLayers(content);
    const idx = (l: Level) => content.getChildIndex(scene.cards[l]);
    expect(idx("rest")).toBeLessThan(idx("lifted"));
    expect(idx("lifted")).toBeLessThan(idx("fan"));
    expect(idx("fan")).toBeLessThan(idx("drag"));
  });

  it("place кладёт спрайт в слой своего уровня (спрайт и тень со-локальны)", () => {
    const content = new Container();
    const scene = new SceneLayers(content);
    const sprite = new Container();
    scene.place(sprite, "lifted");
    expect(sprite.parent).toBe(scene.cards.lifted); // тот же уровень, что и levelOf("lifted")
  });
});
