// СТОЛ РАССКАЗЫВАЕТ О СЕБЕ САМ.
//
// Здесь проверяется не хранилище (у него свой прогон) и не летопись (у неё свой), а ШОВ: живая
// комната, живой игрок, живой ход — и после него в журнале лежит то, по чему партию можно разобрать.
//
// Закон: ни один ход не проходит мимо журнала, и отказ записывается наравне с удачей.

import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { TEST_PORTS, useTestServer } from "../roomHarness.js";
import { MSG, TABLE_ROOM, type Patch, type Welcome } from "./contract.js";
import { applyPatch } from "./patch.js";
import { openEntry, runIn } from "./lobby.js";
import { mintRoom } from "./roomIds.js";
import { deedsOf } from "../db/eventsRepo.js";

const SECRET = "table-secret";
const BOT = "bot-token";
process.env.TABLE_SECRET = SECRET;
process.env.TELEGRAM_BOT_TOKEN = BOT;
process.env.TABLE_GUESTS = "1";

function initData(id: number, name: string): string {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name }) };
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k as keyof typeof fields]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(BOT).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", key).update(check).digest("hex") }).toString();
}

const next = <T>(client: { onMessage: (t: string, cb: (m: T) => void) => void }, type: string) =>
  new Promise<T>((resolve) => client.onMessage(type, resolve));

/** Журнал уходит в базу пачкой по таймеру — ждём, пока лента наберёт ожидаемое. */
async function until(room: string, has: (kinds: string[]) => boolean, tries = 40): Promise<string[]> {
  for (let i = 0; i < tries; i += 1) {
    const kinds = deedsOf(room, 500).map((d) => d.kind);
    if (has(kinds)) return kinds;
    await new Promise((r) => setTimeout(r, 100));
  }
  return deedsOf(room, 500).map((d) => d.kind);
}

describe("chronicle.no-deed-passes-the-journal-by", () => {
  const server = useTestServer(TEST_PORTS.tableChronicle);

  async function sit(room: string) {
    const client = await server().sdk.joinOrCreate(TABLE_ROOM, { room, client: "html", door: "telegram", initData: initData(42, "Ербол") });
    const welcome = next<Welcome>(client, MSG.welcome);
    client.send(MSG.hello);
    return { client, welcome: await welcome };
  }

  it("открытие комнаты и вход человека записаны", async () => {
    const room = mintRoom(SECRET);
    await sit(room);
    const kinds = await until(room, (k) => k.includes("join"));
    expect(kinds[0]).toBe("room.open");
    expect(kinds).toContain("join");
    const join = deedsOf(room, 500).find((d) => d.kind === "join")!;
    expect(join.who).toBe("tg:42");
    expect(join.what).toMatchObject({ name: "Ербол" });
  });

  it("ход игрока и разосланные дифы попали в ленту", async () => {
    const room = mintRoom(SECRET);
    const { client, welcome } = await sit(room);
    client.send(MSG.intent, { t: "grab", id: welcome.snapshot.piles[0]!.cards.at(-1)!.id });
    const kinds = await until(room, (k) => k.includes("act"));
    expect(kinds).toContain("act");
    // Лента реплея: вместе с ходом лежит то, чем стол на него ответил.
    const patch = deedsOf(room, 500).find((d) => d.kind === "patch");
    expect(patch).toBeDefined();
    expect(patch!.what).toMatchObject({ v: expect.any(Number), ops: expect.any(Array) });
  });

  it("отказ стола записан с причиной, а не потерян", async () => {
    const room = mintRoom(SECRET);
    const { client } = await sit(room);
    // Карта, которой на столе нет, — стол не даст; это и есть та жалоба, ради которой журнал заводился.
    client.send(MSG.intent, { t: "grab", id: "нет-такой-карты" });
    const kinds = await until(room, (k) => k.includes("refused"));
    expect(kinds).toContain("refused");
    const no = deedsOf(room, 500).find((d) => d.kind === "refused")!;
    expect(no.who).toBe("tg:42");
    expect(no.what).toMatchObject({ why: expect.anything() });
  });

  it("уход человека записан", async () => {
    const room = mintRoom(SECRET);
    const { client } = await sit(room);
    await client.leave();
    const kinds = await until(room, (k) => k.includes("leave"));
    expect(kinds).toContain("leave");
  });
});

describe("chronicle.a-match-has-edges", () => {
  const server = useTestServer(TEST_PORTS.tableChronicle + 1);

  it("раздача пишет начало партии с игроками, последний ход — её конец", async () => {
    const room = mintRoom(SECRET);
    openEntry(room, { kind: "inline", message: "m" }, "tg:7", undefined, Date.now(), "krest");
    const seat = async (id: number, name: string) => {
      const client = await server().sdk.joinOrCreate(TABLE_ROOM, { room, client: "html", door: "telegram", initData: initData(id, name) });
      // Состояние партии комната рассылает НОВЫМ СНИМКОМ, а не дифом: держим последний и дифы после него.
      let w: Welcome | null = null;
      let patches: Patch[] = [];
      client.onMessage(MSG.patch, (p: Patch) => patches.push(p));
      client.onMessage(MSG.welcome, (m: Welcome) => {
        w = m;
        patches = [];
      });
      client.send(MSG.hello);
      for (let i = 0; i < 50 && !w; i += 1) await new Promise((r) => setTimeout(r, 20));
      return { client, state: () => patches.reduce(applyPatch, w!.snapshot) };
    };
    const ye = await seat(7, "Ye");
    const bo = await seat(8, "Bo");
    expect(await runIn(room, "tg:7", { t: "deal", rule: "each", n: 1, force: true })).toEqual({ ok: true });
    await until(room, (k) => k.includes("match.start"), 80);
    const start = deedsOf(room, 2000).find((d) => d.kind === "match.start")!;
    expect(start.who, "раздавал распорядитель").toBe("tg:7");
    expect((start.what as { игроки: { key: string }[] }).игроки.map((one) => one.key).sort()).toEqual(["tg:7", "tg:8"]);

    // Каждый кладёт свою единственную карту в круг — по очереди, и партия кончается: руки пусты.
    for (let i = 0; i < 2; i += 1) {
      const s = ye.state();
      const turn = s.play?.turn;
      const who = turn === "tg:7" ? ye : bo;
      const card = s.chairs.find((c) => c.owner === turn)!.hand[0]!.id;
      who.client.send(MSG.intent, { t: "grab", id: card });
      await new Promise((r) => setTimeout(r, 150));
      who.client.send(MSG.intent, { t: "drop", id: card, to: { in: "deck", pile: "ring" } });
      await new Promise((r) => setTimeout(r, 400));
    }
    const kinds = await until(room, (k) => k.includes("match.end"), 80);
    expect(kinds, "конец партии записан").toContain("match.end");
    expect(kinds.filter((k) => k === "match.end"), "и ровно один раз").toHaveLength(1);
  }, 30000);
});
