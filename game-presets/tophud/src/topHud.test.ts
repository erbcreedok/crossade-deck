// @vitest-environment jsdom
// THE STRIP AS A DOCUMENT: what it puts up, what it takes down, and the one fact a shelf supplies.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    expect(q(container, "list")).toBeNull();
    q(hud.element, "people")!.click();
    const list = q(container, "list")!;
    expect(list.textContent).toContain("ЗА СТОЛОМ 3");
    expect(list.textContent).toContain("ходит");
    expect(list.textContent).toContain("отошёл");
    document.body.click();
    expect(q(container, "list")).toBeNull();
    hud.stop();
  });

  // СТОРОЖ `tophud.a-face-is-shown-and-the-colour-moves-to-the-rim`.
  //
  // Фотография узнаётся быстрее буквы, но цвет при ней терять нельзя: он и есть то, чем человека
  // различают на сукне и в полосе. Поэтому под картинкой цвет уходит в ОБОДОК, а не исчезает.
  it("у кого есть лицо — рисуется лицо, а его цвет становится ободком", () => {
    const roster = [
      { name: "Алия", ink: "#7fd1b9", role: "owner" as const, seated: true, face: "data:image/png;base64,AAA" },
      { name: "Тимур", ink: "#e08b3f", role: "player" as const, seated: true },
    ];
    const hud = topHud(container, { title: "Карты", people, roster });
    q(hud.element, "people")!.click();
    const list = q(container, "list")!;
    const shown = list.querySelector("img");
    expect(shown?.getAttribute("src")).toBe("data:image/png;base64,AAA");
    // Цвет не потерялся: он стоит ободком вокруг картинки.
    expect(shown!.parentElement!.getAttribute("style")).toContain("#7fd1b9");
    // У кого лица нет — прежний кружок с буквой, залитый его цветом.
    expect(list.textContent).toContain("Тимур");
    hud.stop();
  });

  // СТОРОЖ `tophud.the-list-speaks-for-the-room-not-for-the-session`.
  //
  // Полоса говорит, кто играет; список — чей это стол. Зритель без стула и хозяин, которого сейчас
  // нет за экраном, — такие же его люди, и список, потерявший их между партиями, врёт про комнату.
  it("список, которому дали комнату, говорит про роли и про тех, кого за столом нет", () => {
    const roster = [
      { name: "Алия", ink: "#7fd1b9", role: "owner" as const, seated: true, away: true },
      { name: "Дана", ink: "#b98fe0", role: "player" as const, seated: false, mine: true },
      { name: "Тимур", ink: "#e08b3f", role: "player" as const, seated: true },
    ];
    const hud = topHud(container, { title: "Карты", people, roster });
    q(hud.element, "people")!.click();
    const list = q(container, "list")!;
    // Два числа и только два: мебель считают в листе комнаты.
    expect(list.textContent).toContain("ЗА СТОЛОМ 2 · ВСЕГО 3");
    expect(list.textContent).not.toContain("СТУЛЬЕВ");
    expect(list.textContent).toContain("хозяин");
    expect(list.textContent).toContain("зритель");
    expect(list.textContent).toContain("без стула");
    expect(list.textContent).toContain("отошёл");
    // Своя строка стоит ОТДЕЛЬНОЙ карточкой над списком, а не первой среди чужих имён.
    const mine = q(container, "mine")!;
    expect(mine.textContent).toContain("Дана");
    expect(mine.textContent).not.toContain("Алия");
    // Лист закрывается своим «Закрыть», а не только касанием мимо.
    q(container, "close")!.click();
    expect(q(container, "list")).toBeNull();
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

// СТОРОЖ `tophud.the-panel-draws-only-what-the-room-allowed`.
//
// Панель за столом не решает, что можно: правила живут в комнате, и она же присылает их словами.
// Экран, считающий права сам, — это вторая копия правила, и она разойдётся с первой в тот же день.
// Отказы показываются все и всегда: молча пропавшая кнопка читается как поломка.
describe("панель за столом", () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => container.remove());
  const q = (root: ParentNode, group: string) => root.querySelector<HTMLElement>(`[data-g="${group}"]`);

  const people = [{ seat: "p1", name: "Алия", ink: "#7fd1b9" }];
  const roster = [
    { name: "Алия", ink: "#7fd1b9", role: "owner" as const, seated: true, mine: true, account: "a" },
    {
      name: "Тимур",
      ink: "#e08b3f",
      role: "player" as const,
      seated: true,
      account: "t",
      can: [{ deed: "seat:take", label: "Лишить стула", vote: false }],
      cant: [{ deed: "kick", label: "Выгнать", why: "хозяина нельзя выгнать" }],
    },
  ];

  it("строка раскрывается, и в ней стоит только разрешённое — с причинами на остальное", () => {
    const hud = topHud(container, { title: "Карты", people, roster });
    q(hud.element, "people")!.click();
    const row = container.querySelector<HTMLElement>('[data-row="t"]')!;
    row.click();
    const list = q(container, "list")!;
    expect(list.querySelector('[data-deed="seat:take"]')).not.toBeNull();
    expect(list.querySelector('[data-deed="kick"]'), "чего нельзя — того и нет кнопкой").toBeNull();
    expect(list.textContent).toContain("хозяина нельзя выгнать");
    hud.stop();
  });

  // СТОРОЖ `tophud.the-hand-is-a-sign-not-a-sentence`.
  //
  // Лок, пин и скрытность включены или нет, и это надо ВИДЕТЬ одним взглядом, а не читать: горящий
  // знак говорит о состоянии, слово — нет. И стоят они своей секцией: место и права — другой разговор.
  it("статус руки стоит знаками отдельной секцией, и включённое горит", () => {
    const withHand = [
      roster[0]!,
      {
        ...roster[1]!,
        hand: { lock: true },
        can: [
          { deed: "piece:lock", label: "Лок", vote: false },
          { deed: "piece:hide", label: "Скрытность", vote: false },
          { deed: "seat:take", label: "Лишить стула", vote: false },
        ],
      },
    ];
    const asked: string[][] = [];
    const hud = topHud(container, { title: "Карты", people, roster: withHand, onDeed: (deed, whom) => asked.push([deed, whom]) });
    q(hud.element, "people")!.click();
    container.querySelector<HTMLElement>('[data-row="t"]')!.click();
    const list = q(container, "list")!;
    expect(list.textContent).toContain("СТАТУС РУКИ");
    expect(list.textContent).toContain("МЕСТО И ПРАВА");
    // Знак, а не фраза: у кнопки лока рисунок, а подпись — только в подсказке.
    const lock = list.querySelector<HTMLElement>('[data-deed="piece:lock"]')!;
    expect(lock.querySelector("svg")).not.toBeNull();
    expect(lock.getAttribute("title")).toBe("Лок");
    // Включённое горит: у горящего знака чернильный штрих на золоте.
    expect(lock.getAttribute("style")).toContain("#f2c14e");
    const hide = list.querySelector<HTMLElement>('[data-deed="piece:hide"]')!;
    expect(hide.getAttribute("style")).not.toContain("#f2c14e");
    hide.click();
    expect(asked).toEqual([["piece:hide", "t"]]);
    hud.stop();
  });

  it("нажатие уходит наружу, а отказ комнаты говорится вслух", () => {
    const asked: string[][] = [];
    const hud = topHud(container, { title: "Карты", people, roster, onDeed: (deed, whom) => asked.push([deed, whom]) });
    q(hud.element, "people")!.click();
    container.querySelector<HTMLElement>('[data-row="t"]')!.click();
    container.querySelector<HTMLElement>('[data-deed="seat:take"]')!.click();
    expect(asked).toEqual([["seat:take", "t"]]);

    hud.denied("местами не распоряжаешься");
    // Отказ комнаты стоит в том же блоке «НЕЛЬЗЯ», а не отдельной тревожной строкой.
    expect(q(container, "list")!.textContent).toContain("НЕЛЬЗЯ");
    expect(q(container, "list")!.textContent).toContain("местами не распоряжаешься");
    hud.stop();
  });

  it("свой цвет выбирается из восьми, и выбранный уходит наружу", () => {
    const asked: string[][] = [];
    const mine = [{ ...roster[0]!, can: [{ deed: "colour", label: "Сменить цвет", vote: false }] }, roster[1]!];
    const hud = topHud(container, { title: "Карты", people, roster: mine, onDeed: (deed, whom, colour) => asked.push([deed, whom, colour!]) });
    q(hud.element, "people")!.click();
    // Кнопка цвета стоит в САМОЙ строке: раскрывать её ради цвета не нужно.
    q(container, "paint")!.click();
    // Восемь цветов показаны все, но занятый соседом перечёркнут и не нажимается.
    expect(q(container, "palette")!.querySelectorAll("button").length).toBe(8);
    expect(q(container, "palette")!.textContent).toContain("×");
    const swatches = container.querySelectorAll<HTMLElement>("[data-colour]");
    expect(swatches.length).toBe(7);
    swatches[2]!.click();
    expect(asked[0]![0]).toBe("colour");
    expect(asked[0]![1]).toBe("a");
    expect(asked[0]![2]).toMatch(/^#[0-9a-f]{6}$/i);
    hud.stop();
  });
});
