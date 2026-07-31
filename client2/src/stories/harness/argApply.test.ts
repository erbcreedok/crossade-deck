import { describe, it, expect } from "vitest";
import { planFor, type ApplyPlan } from "./argApply";

// Правило «живьём или пересобрать» — единственное место, где решается, переживёт ли правка
// аргумента текущий экземпляр компонента. Ошибка тут выглядит как «контрол не работает» либо как
// «сцену передёргивает на каждый чих», и то и другое в браузере ловится плохо. Поэтому — юнитами.

interface A {
  card: string;
  hidden: boolean;
  back: string;
}
const plan: ApplyPlan<unknown, A> = {
  card: () => undefined, // живой сеттер
  hidden: () => undefined,
  back: "rebuild",
};

const base: A = { card: "A♠", hidden: false, back: "ruby" };

describe("planFor", () => {
  it("пустой дифф — ничего не делаем", () => {
    const r = planFor(base, { ...base }, plan);
    expect(r.rebuild).toBe(false);
    expect(r.live).toEqual([]);
  });

  it("правка «живого» ключа не пересобирает сцену", () => {
    const r = planFor(base, { ...base, card: "K♥" }, plan);
    expect(r.rebuild).toBe(false);
    expect(r.live.map((l) => l.key)).toEqual(["card"]);
  });

  it("правка «пересборочного» ключа пересобирает", () => {
    const r = planFor(base, { ...base, back: "emerald" }, plan);
    expect(r.rebuild).toBe(true);
  });

  it("если пересборка нужна — живые правки не выполняются: их применит сама пересборка", () => {
    const r = planFor(base, { ...base, card: "K♥", back: "emerald" }, plan);
    expect(r.rebuild).toBe(true);
    expect(r.live).toEqual([]);
  });

  it("НЕИЗВЕСТНЫЙ ключ — пересборка (падаем закрыто)", () => {
    // Опцию добавили в компонент, в план внести забыли. Молча проигнорировать — значит показать
    // в каталоге неправду; пересобрать — потерять пан/зум, но остаться честным.
    const r = planFor(base, { ...base, novel: 1 } as unknown as A, plan);
    expect(r.rebuild).toBe(true);
  });

  it("исчезнувший ключ тоже считается изменением", () => {
    const next = { ...base } as Partial<A>;
    delete next.hidden;
    const r = planFor(base, next as A, plan);
    expect(r.live.map((l) => l.key)).toEqual(["hidden"]);
  });

  it("порядок живых правок повторяет порядок ключей плана — воспроизводимость", () => {
    const r = planFor(base, { ...base, hidden: true, card: "K♥" }, plan);
    expect(r.live.map((l) => l.key)).toEqual(["card", "hidden"]);
  });

  it("сеттер, вернувший \"rebuild\" на месте, поднимает флаг — решение бывает известно только по значению", () => {
    // Пример из жизни: faceUp правится живьём переворотом, но у НЕпереворачиваемой карты —
    // только пересборкой. Знать это заранее нельзя, решает сам применяющий.
    const p: ApplyPlan<unknown, A> = { ...plan, card: () => "rebuild" };
    const r = planFor(base, { ...base, card: "K♥" }, p);
    expect(r.rebuild).toBe(false); // на этапе планирования ещё нет
    expect(r.live[0].apply({}, r.live[0].value)).toBe("rebuild"); // ...а при применении выяснится
  });

  it("первый прогон (prev отсутствует) — пересборка, а не N живых правок", () => {
    const r = planFor(undefined, base, plan);
    expect(r.rebuild).toBe(true);
  });
});
