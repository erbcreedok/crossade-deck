// @vitest-environment jsdom
// СТОРОЖ `hub.a-tile-asks-which-table`.
//
// Нажатие на плитку прежде молча открывало НОВЫЙ стол: прийти на чужой открытый стол было нельзя
// никак, только переслать ссылку. И второе, ради чего этот экран: мёртвый код не уводит человека
// молча — ему говорят, что стол закрылся, и рядом кладут открытые.

import { describe, expect, it, vi } from "vitest";
import { tablesScreen, type RoomsGateway } from "./tables.js";
import type { RoomCard } from "@crossade/wire";

const card = (one: Partial<RoomCard> & { code: string }): RoomCard => ({
  room: `rec-${one.code}`,
  game: "cards",
  title: null,
  seats: null,
  visibility: "public",
  admission: "code",
  ...one,
});

function stand(over: Partial<RoomsGateway> = {}) {
  const sat: { game: string; code: string }[] = [];
  const opened: unknown[] = [];
  const gateway: RoomsGateway = {
    find: async () => [card({ code: "0244", players: 2 })],
    mine: async () => [],
    open: async (o) => {
      opened.push(o);
      return card({ code: "7777" });
    },
    peek: async (code) => (code === "0244" ? card({ code: "0244" }) : undefined),
    close: async () => true,
    me: () => "acc-1",
    ...over,
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const screen = tablesScreen(container, { gateway, onSit: (game, code) => sat.push({ game, code }) });
  const press = (what: string): void => screen.element.querySelector<HTMLElement>(`[data-do="${what}"]`)?.click();
  const text = (): string => screen.element.textContent ?? "";
  return { screen, press, text, sat, opened, gateway };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("hub.a-tile-asks-which-table", () => {
  it("открытые столы этой игры видно, и за них можно сесть", async () => {
    const s = stand();
    await s.screen.show("cards", "Карты");

    expect(s.text()).toContain("0244");
    expect(s.text()).toContain("2 за столом");

    s.press("sit:0244:rec-0244");
    await settle();
    expect(s.sat).toEqual([{ game: "cards", code: "0244" }]);
  });

  it("свой стол открывается с выбранными осями, и человек сразу садится за него", async () => {
    const s = stand();
    await s.screen.show("cards", "Карты");

    s.press("vis:hidden");
    s.press("adm:invite");
    s.press("create");
    await settle();

    expect(s.opened).toEqual([{ game: "cards", visibility: "hidden", admission: "invite" }]);
    expect(s.sat).toEqual([{ game: "cards", code: "7777" }]);
  });

  it("оси независимы: скрытый стол может пускать всех по ссылке", async () => {
    const s = stand();
    await s.screen.show("cards", "Карты");
    s.press("vis:hidden");
    s.press("adm:open");
    s.press("create");
    await settle();
    expect(s.opened).toEqual([{ game: "cards", visibility: "hidden", admission: "open" }]);
  });

  it("мёртвый код: сказано, что стол закрылся, и никуда не уводят", async () => {
    const s = stand({ find: async () => [] });
    const container = document.createElement("div");
    const sat: string[] = [];
    const screen = tablesScreen(container, {
      gateway: s.gateway,
      ask: async () => "9999",
      onSit: (_g, code) => sat.push(code),
    });
    await screen.show("cards", "Карты");

    screen.element.querySelector<HTMLElement>('[data-do="code"]')?.click();
    await settle();
    await settle();

    expect(screen.element.textContent).toContain("Стол закрылся");
    expect(sat).toEqual([]);
  });

  it("сервер не ответил — так и сказано, а не пустой экран", async () => {
    const s = stand({ open: async () => undefined });
    await s.screen.show("cards", "Карты");
    s.press("create");
    await settle();
    expect(s.text()).toContain("Не вышло открыть стол");
    expect(s.sat).toEqual([]);
  });

  it("свои столы показываются отдельно, и свой можно закрыть", async () => {
    const closed: string[] = [];
    const s = stand({
      mine: async () => [card({ code: "0101", own: true })],
      close: async (room) => {
        closed.push(room);
        return true;
      },
    });
    await s.screen.show("cards", "Карты");

    expect(s.text()).toContain("Мои столы");
    s.press("shut::rec-0101");
    await settle();
    expect(closed).toEqual(["rec-0101"]);
    expect(s.text()).toContain("Стол закрыт");
  });

  it("чужой игры среди своих столов нет", async () => {
    const s = stand({ mine: async () => [card({ code: "0303", game: "chess" })] });
    await s.screen.show("cards", "Карты");
    expect(s.text()).not.toContain("0303");
  });

  it("код вводится руками — и живой уводит за тот же стол", async () => {
    const s = stand();
    const ask = vi.fn(async () => "0244");
    const container = document.createElement("div");
    const sat: string[] = [];
    const screen = tablesScreen(container, { gateway: s.gateway, ask, onSit: (_g, code) => sat.push(code) });
    await screen.show("cards", "Карты");
    screen.element.querySelector<HTMLElement>('[data-do="code"]')?.click();
    await settle();
    expect(ask).toHaveBeenCalled();
    expect(sat).toEqual(["0244"]);
  });

  it("«Назад» закрывает экран, не уводя в игру", async () => {
    const s = stand();
    await s.screen.show("cards", "Карты");
    s.press("back");
    expect(s.text()).toBe("");
    expect(s.sat).toEqual([]);
  });
});
