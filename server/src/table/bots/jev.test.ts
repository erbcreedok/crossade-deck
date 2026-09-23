// JEV — БЕЗ СЕТИ. `fetch` подменён: проверяется, что мозг просит, как разбирает ответ и что делает,
// когда ключа нет.
//
// Отдельно проверяется сила бота: из одних и тех же вероятностей «лучший», «по вероятностям» и
// «слабый» обязаны давать разные ходы — иначе настройка силы существует только на словах.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Face } from "../contract.js";
import { krestMemory } from "../games/krestMemory.js";
import type { BotView, Move } from "./brain.js";
import { choose, jevBrain } from "./jev.js";
import { PROFILES } from "./profiles.js";
import { brainOf, BRAIN_KEYS } from "./brains.js";

const c = (rank: string, suit: Face["suit"]): Face => ({ rank, suit });
const id = (f: Face) => `${f.rank}${f.suit}`;
const lay = (f: Face): Move => ({ t: "lay", id: id(f), card: f, to: { in: "deck", pile: "ring" } });

const view = (): BotView => ({
  ring: [c("6", "c")],
  hand: [{ id: id(c("7", "c")), face: c("7", "c") }, { id: id(c("A", "c")), face: c("A", "c") }],
  others: [{ chair: "b", name: "Боря", cards: 5 }],
  closesIfLay: false,
  openerIfTake: null,
  facts: krestMemory([], { a: 2, b: 5 }),
});
const legal: Move[] = [lay(c("7", "c")), lay(c("A", "c"))];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("bots.jev-picks-from-probabilities", () => {
  it("ЛУЧШИЙ берёт самый вероятный ход", () => {
    expect(choose([0.2, 0.7, 0.1], "best")).toBe(1);
  });

  it("СЛАБЫЙ берёт из нижней половины — играет по правилам, но хуже", () => {
    expect(choose([0.7, 0.2, 0.1], "weak", () => 0), "нижняя половина — второй и третий").toBe(1);
  });

  it("ПО ВЕРОЯТНОСТЯМ: почти вся масса у одного — его и тянем", () => {
    expect(choose([0.98, 0.01, 0.01], "sample", () => 0.5)).toBe(0);
  });

  it("вероятностей нет — не падает", () => {
    expect(choose([], "best")).toBe(0);
    expect(choose([0, 0], "sample", () => 0.5)).toBe(0);
  });
});

describe("bots.jev-talks-to-the-service", () => {
  it("шлёт стол и список ходов, берёт ответ по вероятностям", async () => {
    vi.stubEnv("JEV_API_KEY", "ключ");
    let послано: { state?: string; choices?: string[] } = {};
    vi.stubGlobal("fetch", async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      послано = JSON.parse(init.body) as typeof послано;
      expect(init.headers["authorization"], "ключ уходит заголовком, а не в теле").toBe("Bearer ключ");
      return { ok: true, json: async () => ({ probabilities: [0.1, 0.9] }) };
    });
    const move = await jevBrain("best").choose(legal, view(), PROFILES["агрессор"]!, 500);
    expect(move).toEqual(legal[1]);
    expect(послано.choices, "ходы названы словами").toEqual(["положить 7 крест", "положить A крест"]);
    expect(послано.state).toContain("Твоя рука");
  });

  it("НЕТ КЛЮЧА — честная ошибка, а не тихий скриптовый ход", async () => {
    vi.stubEnv("JEV_API_KEY", "");
    await expect(jevBrain().choose(legal, view(), PROFILES["новичок"]!, 500)).rejects.toThrow("JEV_API_KEY");
  });

  it("служба ответила мимо списка — ошибка, и комната возьмёт запасной", async () => {
    vi.stubEnv("JEV_API_KEY", "ключ");
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ choice: 42 }) }));
    await expect(jevBrain().choose(legal, view(), PROFILES["новичок"]!, 500)).rejects.toThrow("мимо списка");
  });

  it("служба отказала — ошибка с кодом", async () => {
    vi.stubEnv("JEV_API_KEY", "ключ");
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(jevBrain().choose(legal, view(), PROFILES["новичок"]!, 500)).rejects.toThrow("401");
  });

  it("ход всего один — спрашивать не о чем и платить не за что", async () => {
    vi.stubEnv("JEV_API_KEY", "ключ");
    vi.stubGlobal("fetch", async () => {
      throw new Error("не должно быть запроса");
    });
    const move = await jevBrain().choose([legal[0]!], view(), PROFILES["новичок"]!, 500);
    expect(move).toEqual(legal[0]);
  });
});

describe("bots.the-catalogue-always-gives-a-brain", () => {
  it("незнакомое имя — скриптовый мозг, а не падение", () => {
    expect(brainOf("такого-нет").key).toBe("greedy");
    expect(brainOf(undefined).key).toBe("greedy");
  });

  it("все названные мозги выдаются по имени", () => {
    for (const key of BRAIN_KEYS) expect(brainOf(key).key, key).toBe(key === "greedy" ? "greedy" : key);
  });
});
