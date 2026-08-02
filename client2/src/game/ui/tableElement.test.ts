import { describe, it, expect } from "vitest";
import { Card } from "./Card";
import { Piece } from "./Piece";
import { pieceVisual } from "./pieceKinds";
import { texStub } from "../../test/texStub";
import { BASE_PRESET } from "../anim/presets";

// ЭЛЕМЕНТ СТОЛА — карта и фишка на одном законе. Здесь проверяется то, что живёт ВНУТРИ элемента и
// потому не берётся чистыми модулями: высота как свойство, дыхание, условие сна цикла, тень,
// выведенная из состояния, и смерть после эффекта.
//
// Настоящий Pixi, без подставной реализации: рендерер нужен только чтобы ИСПЕЧЬ текстуру, а её
// подсовывает `texStub`. Всё, что ниже, движок считает на CPU — значит и тест считает то же самое.

const tex = texStub();
const card = (o: Partial<ConstructorParameters<typeof Card>[0]> = {}) => new Card({ id: "c", card: "A♠", ...o }, tex, 1);
const chip = (o: Partial<ConstructorParameters<typeof Piece>[0]> = {}) => {
  const r = 30;
  const { build, shadow } = pieceVisual({ kind: "chip", color: 0xc79a3e, denom: "25" }, r);
  return new Piece({ id: "p", w: r * 2, h: r * 2, build, shadow, ...o });
};
// Предмет со СВОЕЙ тенью-картинкой. Снимок здесь подставной: снимают его с визуала живым
// рендерером (ui/silhouetteExtract.ts), а закон «тень идёт картинкой предмета» от способа её
// добычи не зависит.
const OWN = { texture: {} as never, bounds: { x: -20, y: -10, width: 40, height: 20 } };
const standing = (o: Partial<ConstructorParameters<typeof Piece>[0]> = {}) => {
  const r = 30;
  const { build, shadow } = pieceVisual({ kind: "chess", dark: true, glyph: "♞" }, r);
  return new Piece({ id: "s", w: r * 2, h: r * 2, build, shadow, own: OWN, ...o });
};

describe("высота (`z`) — свойство КАЖДОГО элемента", () => {
  it("у всего, что лежит на столе, высота нулевая", () => {
    const c = card();
    const p = chip();
    c.sync();
    p.sync();
    // Лежащий предмет не поднят над столом: экранная позиция совпадает с его местом.
    expect(c.root.position.y).toBeCloseTo(c.body.py, 6);
    expect(p.root.position.y).toBeCloseTo(p.body.py, 6);
  });

  it("заданная высота поднимает предмет по ЭКРАНУ и укрупняет его — у карты и у фишки одинаково", () => {
    for (const el of [card(), chip()]) {
      el.sync();
      const y0 = el.root.position.y;
      const s0 = el.root.scale.x;
      el.setZ(0.4);
      el.sync();
      expect(el.root.position.y, el.id).toBeLessThan(y0); // выше по экрану
      expect(el.root.scale.x, el.id).toBeGreaterThan(s0); // ближе к зрителю — крупнее
    }
  });

  it("высота не бывает отрицательной: «под столом» — это ноль, а не дырка в столе", () => {
    const c = card();
    c.setZ(-5);
    c.sync();
    expect(c.root.position.y).toBeCloseTo(c.body.py, 6);
  });

  it("поза и заданная высота СКЛАДЫВАЮТСЯ, а не спорят", () => {
    const plain = card({ pose: "held" });
    const raised = card({ pose: "held", z: 0.2 });
    plain.sync();
    raised.sync();
    expect(raised.root.position.y).toBeLessThan(plain.root.position.y);
  });
});

describe("дыхание — тот же закон у карты и у фишки", () => {
  const bobbed = (el: Card | Piece) => {
    el.sync();
    const y0 = el.root.position.y;
    el.step(0.25);
    el.sync();
    return Math.abs(el.root.position.y - y0) > 0.01;
  };

  it("поднятый дышит по умолчанию — и карта, и фишка", () => {
    expect(bobbed(card({ pose: "lifted" }))).toBe(true);
    expect(bobbed(chip({ pose: "lifted" }))).toBe(true);
  });

  it("лежащий не дышит, пока не попросят", () => {
    expect(bobbed(card())).toBe(false);
    expect(bobbed(chip())).toBe(false);
  });

  it("явное `idle` перебивает позу в обе стороны — и у фишки тоже", () => {
    expect(bobbed(card({ idle: true }))).toBe(true);
    expect(bobbed(chip({ idle: true }))).toBe(true);
    expect(bobbed(card({ pose: "lifted", idle: false }))).toBe(false);
    expect(bobbed(chip({ pose: "lifted", idle: false }))).toBe(false);
  });

  it("«уменьшить движение» замораживает дыхание обоим, не трогая позу", () => {
    const c = card({ pose: "lifted" });
    const p = chip({ pose: "lifted" });
    c.reduceMotion = true;
    p.reduceMotion = true;
    expect(bobbed(c)).toBe(false);
    expect(bobbed(p)).toBe(false);
    expect(c.pose).toBe("lifted"); // поднятой она быть не перестала
    expect(p.pose).toBe("lifted");
  });
});

describe("сон цикла идёт по САМОМУ дыханию, а не по позе", () => {
  it("дышащий держит цикл бодрым, неподвижный — отпускает", () => {
    expect(card({ pose: "lifted" }).resting).toBe(false);
    expect(chip({ pose: "lifted" }).resting).toBe(false);
    // Поднятая, но неподвижная: держать ради неё 60 fps незачем.
    expect(card({ pose: "lifted", idle: false }).resting).toBe(true);
    expect(chip({ pose: "lifted", idle: false }).resting).toBe(true);
  });

  it("лежащий с включённым дыханием цикл НЕ отпускает — иначе качание не проиграется", () => {
    expect(card({ idle: true }).resting).toBe(false);
    expect(chip({ idle: true }).resting).toBe(false);
  });

  it("замороженное движение отпускает цикл: статичный кадр не должен жечь кадры вхолостую", () => {
    const c = card({ pose: "lifted" });
    c.reduceMotion = true;
    expect(c.resting).toBe(true);
  });
});

describe("тень выводится из состояния КАЖДЫЙ кадр", () => {
  it("силуэт появляется сам, без всякой «теневой анимации»", () => {
    const c = card();
    expect(c.shadowRect).toBeNull(); // до первого кадра его просто нет
    c.sync();
    expect(c.shadowRect).not.toBeNull();
  });

  it("предмет двинулся — тень пересчиталась следом, а не осталась на месте", () => {
    const c = card();
    c.sync();
    const before = c.shadowRect!.x;
    c.body.snapTo({ x: c.body.px + 100, y: c.body.py, rot: 0, scale: 1 });
    c.sync();
    expect(c.shadowRect!.x - before).toBeCloseTo(100, 3);
  });

  it("поднялся — тень отъехала и (у лежащей на столе модели) выросла; это следствие высоты, а не своя анимация", () => {
    const c = card();
    c.sync();
    const flat = { ...c.shadowRect! };
    c.setZ(0.5);
    c.sync();
    expect(c.shadowRect!.y - c.root.position.y).toBeGreaterThan(flat.y - c.body.py);
  });

  it("у фишки силуэт эллиптический, у карты — прямоугольный: форма это параметр одного закона", () => {
    const c = card();
    const p = chip();
    c.sync();
    p.sync();
    expect(c.shadowRect!.round).toBeUndefined();
    expect(p.shadowRect!.round).toBe(true);
  });

  it("у предмета со своей тенью она идёт КАРТИНКОЙ, а не габаритом, и растёт вместе с ним", () => {
    const p = standing();
    p.sync();
    expect(p.shadowRect!.image!.texture).toBe(OWN.texture);
    expect(p.shadowRect!.image!.bw).toBe(OWN.bounds.width);
    const k0 = p.shadowRect!.image!.k;
    p.setZ(0.5); // подняли — предмет нарисован крупнее, и его тень во столько же
    p.sync();
    expect(p.shadowRect!.image!.k).toBeGreaterThan(k0);
  });

  it("пока предмет горит, форму задаёт ЭФФЕКТ: спорить двум формам не о чем", () => {
    const p = standing();
    p.setAnimPreset({ ...BASE_PRESET, destroy: { ...BASE_PRESET.destroy, style: "shred" } });
    p.burn();
    for (let i = 0; i < 5 && !p.dead; i++) p.step(0.05);
    p.sync();
    expect(p.shadowRect!.image).toBeUndefined();
    expect(p.shadowRect!.poly).toBeTruthy();
  });
});

describe("догоревший элемент умирает — иначе последний кадр застынет на столе", () => {
  const burnTo = (el: Card | Piece) => {
    el.setAnimPreset(BASE_PRESET);
    el.burn();
    for (let i = 0; i < 200 && !el.dead; i++) el.step(0.05);
    return el.dead;
  };

  it("и карта, и фишка помечаются мёртвыми по концу эффекта", () => {
    expect(burnTo(card())).toBe(true);
    expect(burnTo(chip())).toBe(true);
  });

  it("пока горит — жив: снести его раньше времени значит оборвать эффект на середине", () => {
    const c = card();
    c.setAnimPreset(BASE_PRESET);
    c.burn();
    c.step(0.02);
    expect(c.dead).toBe(false);
  });
});
