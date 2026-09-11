// @vitest-environment jsdom
// THE STRIP AS A DOCUMENT: what it puts up, what it takes down, and the one fact a shelf supplies.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { topHud, TOP_HUD_VAR } from "./topHud.js";
import type { TopHudPerson } from "./row.js";

const people: TopHudPerson[] = [
  { seat: "p1", name: "Ербол", ink: "#f2c14e", turn: true },
  { seat: "p2", name: "Марат", ink: "#7fd1b9" },
  { seat: "p3", name: "Алия", ink: "#e08b3f", away: true },
];

let container: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = "";
  container = document.createElement("div");
  document.body.appendChild(container);
});

const q = (el: HTMLElement, g: string) => el.querySelector<HTMLElement>(`[data-g="${g}"]`);

describe("верхний HUD", () => {
  it("в стендалоне выхода нет, а название есть", () => {
    const hud = topHud(container, { title: "Шахматы", room: "0244", people });
    expect(q(hud.element, "back")).toBeNull();
    expect(q(hud.element, "title")!.textContent).toContain("Шахматы");
    expect(q(hud.element, "room")!.textContent).toContain("0244");
    hud.stop();
  });

  it("выход появляется ровно тогда, когда его дал хаб, и ведёт туда, куда сказано", () => {
    const go = vi.fn();
    const hud = topHud(container, { title: "Карты", exit: { go } });
    const back = q(hud.element, "back")!;
    back.click();
    expect(go).toHaveBeenCalledTimes(1);
    hud.stop();
  });

  it("нажатие на ряд открывает полный список сидящих, и он закрывается касанием мимо", () => {
    const hud = topHud(container, { title: "Карты", people });
    expect(q(hud.element, "list")).toBeNull();
    q(hud.element, "people")!.click();
    const list = q(hud.element, "list")!;
    expect(list.textContent).toContain("ЗА СТОЛОМ 3");
    expect(list.textContent).toContain("ходит");
    expect(list.textContent).toContain("отошёл");
    document.body.click();
    expect(q(hud.element, "list")).toBeNull();
    hud.stop();
  });

  it("подсевший за стол перерисовывает ряд, а не полосу целиком заново", () => {
    const hud = topHud(container, { title: "Карты", people: people.slice(0, 1) });
    expect(hud.element.querySelectorAll('[data-g="people"] div div')).toHaveLength(1);
    hud.set({ people });
    expect(hud.element.querySelectorAll('[data-g="people"] div div')).toHaveLength(3);
    hud.stop();
  });

  it("пустой стол — ряда нет вовсе", () => {
    const hud = topHud(container, { title: "Косынка", people: [] });
    expect(q(hud.element, "people")).toBeNull();
    hud.stop();
  });

  it("снимается без остатка: ни элемента, ни слушателей", () => {
    const hud = topHud(container, { title: "Карты", people });
    const draws = vi.spyOn(hud.element, "remove");
    hud.stop();
    expect(draws).toHaveBeenCalled();
    expect(container.querySelector(".crossade-tophud")).toBeNull();
  });

  it("чёлка: полоса отступает от неё сама, и сама же говорит странице свою высоту", () => {
    const hud = topHud(container, { title: "Карты" });
    expect(document.getElementById("crossade-tophud")!.textContent).toContain("env(safe-area-inset-top");
    expect(document.documentElement.style.getPropertyValue(TOP_HUD_VAR)).toMatch(/px$/);
    hud.stop();
    expect(document.documentElement.style.getPropertyValue(TOP_HUD_VAR)).toBe("");
  });

  it("имя и код комнаты приходят как текст, а не как разметка", () => {
    const hud = topHud(container, { title: "<b>Карты</b>", people: [{ seat: "p1", name: "<i>Х", ink: "#fff" }] });
    expect(hud.element.querySelector("b")).toBeNull();
    expect(hud.element.querySelector("i")).toBeNull();
    hud.stop();
  });
});
