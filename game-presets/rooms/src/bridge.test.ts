// СТОРОЖ `rooms.the-bridge-gives-back-three-answers-and-knows-nothing-else`.
//
// Мост стоит между хабом и игрой. Всё, что он отдаёт наружу, — войти в комнату, создать такую и
// стол без комнаты; всё, что ему дают, — комнаты, кто смотрит и что ответил сервер. Мост, знающий
// наш сервер, нельзя ни показать на стенде, ни открыть из игры на её собственном URL.
//
// И второе, ради чего он собран так: КОД ВЫДАН ЗАРАНЕЕ. Комнату зовут кодом, и он должен быть в
// руках ДО нажатия «Создать» — чтобы его отправили другу, ещё не сев за стол.

import { describe, expect, it, vi } from "vitest";
import { roomsBridge, type BridgeOptions } from "./bridge.js";
import type { Room } from "./rooms.js";

const GAMES = [
  { id: "cards", name: "Карты", sign: "♠" },
  { id: "chess", name: "Шахматы", sign: "♞" },
];

const room = (one: Partial<Room> & { code: string }): Room => ({
  group: "public",
  game: GAMES[0]!,
  seats: 4,
  taken: 2,
  online: 2,
  people: [{ name: "Марат", color: null }, { name: "Алия", color: null }],
  openness: "public",
  mode: "free",
  forever: false,
  owner: "Марат",
  age: "только что",
  ...one,
});

function stand(over: Partial<BridgeOptions> = {}) {
  const entered: string[] = [];
  const made: unknown[] = [];
  let solo = 0;
  const codes = ["MAFT", "JK23", "PQRT"];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const bridge = roomsBridge(container, {
    games: GAMES,
    game: "cards",
    onEnter: (code) => entered.push(code),
    onCreate: (table) => made.push(table),
    onSolo: () => {
      solo += 1;
    },
    freshCode: async () => codes.shift(),
    ask: async () => undefined,
    ...over,
  });
  const press = (what: string): void => bridge.element.querySelector<HTMLElement>(`[data-do="${what}"]`)?.click();
  const text = (): string => bridge.element.textContent ?? "";
  const has = (what: string): boolean => !!bridge.element.querySelector(`[data-do="${what}"]`);
  return { bridge, press, text, has, entered, made, solo: () => solo };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("rooms.the-bridge-gives-back-three-answers-and-knows-nothing-else", () => {
  it("войти в комнату — это код наружу, и мост закрывается", async () => {
    const s = stand();
    s.bridge.show({ rooms: [room({ code: "0244" })], who: "member" });

    s.press("enter:0244");
    await settle();

    expect(s.entered).toEqual(["0244"]);
    expect(s.bridge.shown).toBe(false);
  });

  it("создать такую — наружу уходит стол целиком, с кодом, укладом и вечностью", async () => {
    const s = stand();
    s.bridge.show({ rooms: [], who: "member" });

    s.press("create");
    await settle();
    s.press("vis:friends");
    s.press("mode:council");
    s.press("forever");
    s.press("made");
    await settle();

    expect(s.made).toEqual([
      { game: "cards", code: "MAFT", openness: "friends", mode: "council", seats: 4, forever: true },
    ]);
  });

  it("код выдан ДО создания и виден на экране — его отправляют другу раньше, чем садятся", async () => {
    const s = stand();
    s.bridge.show({ rooms: [], who: "member" });

    s.press("create");
    await settle();

    expect(s.text()).toContain("MAFT");
    expect(s.made).toEqual([]);
  });

  it("код можно перевыдать, и следующий стол получит свой", async () => {
    const s = stand();
    s.bridge.show({ rooms: [], who: "member" });
    s.press("create");
    await settle();

    s.press("code:new");
    await settle();
    expect(s.text()).toContain("JK23");

    s.press("made");
    await settle();
    expect((s.made[0] as { code: string }).code).toBe("JK23");
  });

  it("стол без комнаты — третий ответ наружу", async () => {
    const s = stand();
    s.bridge.show({ rooms: [room({ code: "0244" })], who: "member" });
    s.press("solo");
    await settle();
    expect(s.solo()).toBe(1);
    expect(s.bridge.shown).toBe(false);
  });
});

describe("список: свои первыми, и свой стол выглядит своим", () => {
  it("группы идут в своём порядке, а пустых заголовков нет", () => {
    const s = stand();
    s.bridge.show({
      rooms: [room({ code: "PUB1" }), room({ code: "MINE", group: "mine", mySeat: true })],
      who: "member",
    });

    const said = s.text();
    expect(said.indexOf("ТВОИ СТОЛЫ")).toBeLessThan(said.indexOf("ПУБЛИЧНЫЕ"));
    expect(said).not.toContain("ГДЕ ДРУЗЬЯ");
  });

  it("за своим столом важно не сколько мест, а есть ли там кто-то", () => {
    const s = stand();
    s.bridge.show({
      rooms: [room({ code: "MINE", group: "mine", mySeat: true, taken: 3, online: 1 })],
      who: "member",
    });
    expect(s.text()).toContain("сейчас 1 из 3");
    expect(s.has("enter:MINE")).toBe(true);
  });

  it("все вышли — стол ждёт, и это говорится словами", () => {
    const s = stand();
    s.bridge.show({ rooms: [room({ code: "MINE", group: "mine", mySeat: true, taken: 2, online: 0 })], who: "member" });
    expect(s.text()).toContain("все вышли · стол ждёт");
  });

  it("твой ход — единственное, ради чего список открывают заново", () => {
    const s = stand();
    s.bridge.show({ rooms: [room({ code: "MINE", group: "mine", mySeat: true, myTurn: true })], who: "member" });
    expect(s.text()).toContain("твой ход");
  });

  it("полный чужой стол — «мест нет», и войти за него нельзя, только смотреть", () => {
    const s = stand();
    s.bridge.show({ rooms: [room({ code: "FULL", seats: 2, taken: 2 })], who: "member" });
    expect(s.text()).toContain("мест нет");
    expect(s.text()).toContain("Смотреть");
  });

  it("«Инфо» раскрывает хозяина, уклад и людей — и закрывается обратно", () => {
    const s = stand();
    s.bridge.show({ rooms: [room({ code: "0244" })], who: "member" });

    s.press("info:0244");
    expect(s.text()).toContain("Хозяин");
    expect(s.text()).toContain("вольница");

    s.press("info:0244");
    expect(s.text()).not.toContain("Хозяин");
  });

  it("гостю говорят, чего он не видит, а не молча сокращают список", () => {
    const s = stand();
    s.bridge.show({ rooms: [room({ code: "0244" })], who: "guest" });
    expect(s.text()).toContain("после входа");
  });
});

describe("поиск сужает тот же список", () => {
  it("фильтры видны чипсами и снимаются по одному", async () => {
    const s = stand();
    s.bridge.show({ rooms: [room({ code: "A" }), room({ code: "B", seats: 8 })], who: "member" });

    s.press("find");
    s.press("fMode:council");
    s.press("found");
    await settle();

    expect(s.text()).toContain("совет");
    expect(s.text()).toContain("не подошёл ни один стол");

    s.press("chip:mode");
    await settle();
    expect(s.text()).toContain("A");
    expect(s.text()).not.toContain("не подошёл");
  });

  it("под фильтрами пусто и без фильтров пусто — разные экраны", async () => {
    const empty = stand();
    empty.bridge.show({ rooms: [], who: "member" });
    expect(empty.text()).toContain("Открытых столов сейчас нет");

    // Тот же пустой список, но сужённый руками, говорит другое — и считает, сколько столов скрыл.
    const narrow = stand({ ask: async () => "8" });
    narrow.bridge.show({ rooms: [room({ code: "A", seats: 2 })], who: "member" });
    narrow.press("find");
    narrow.press("fSeats");
    await settle();
    narrow.press("found");
    await settle();
    expect(narrow.text()).toContain("Всего открыто 1");
    expect(narrow.text()).toContain("мест от 8");
  });
});

describe("свои экраны на молчание сервера", () => {
  it("грузится — сказано, что спрашиваем", () => {
    const s = stand();
    s.bridge.show({ rooms: [], who: "member", answer: "loading" });
    expect(s.text()).toContain("Спрашиваем сервер");
  });

  it("молчит — «ещё раз» и «играть одному», а не пустой экран", () => {
    const s = stand();
    s.bridge.show({ rooms: [], who: "member", answer: "silent" });
    expect(s.text()).toContain("Сервер не отвечает");
    expect(s.has("retry")).toBe(true);
    expect(s.has("solo")).toBe(true);
  });
});

describe("сказанное тому, кого сюда вернули", () => {
  it("стоит НАД списком: первым читается, почему он здесь", () => {
    const s = stand();
    s.bridge.show({ rooms: [room({ code: "0244" })], who: "member", said: "Стол закрылся." });
    const said = s.text();
    expect(said).toContain("Стол закрылся.");
    expect(said.indexOf("Стол закрылся.")).toBeLessThan(said.indexOf("0244"));
  });

  it("пришёл сам — ничего не говорят", () => {
    const s = stand();
    s.bridge.show({ rooms: [room({ code: "0244" })], who: "member" });
    expect(s.text()).not.toContain("Стол закрылся");
  });
});
