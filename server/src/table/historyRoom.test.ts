// ИСТОРИЯ ДО МОЕГО ПРИХОДА, ЖИВАЯ КОМНАТА: один играет и тащит карту, второй просит прошлое — и получает ходы, путь пальца, но не лица закрытых карт.

import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { TEST_PORTS, useTestServer } from "../roomHarness.js";
import { MSG, TABLE_ROOM, type History, type HistoryNone, type Welcome } from "./contract.js";
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
const next = <T>(client: { onMessage: (t: string, cb: (m: T) => void) => void }, type: string) => new Promise<T>((resolve) => client.onMessage(type, resolve));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("history.the-past-comes-in-pages-without-the-faces-you-may-not-see", () => {
  const server = useTestServer(TEST_PORTS.tableHistory);
  async function sit(room: string, id: number, name: string) {
    const client = await server().sdk.joinOrCreate(TABLE_ROOM, { room, client: "html", door: "telegram", initData: initData(id, name) });
    const welcome = next<Welcome>(client, MSG.welcome);
    client.send(MSG.hello);
    return { client, welcome: await welcome };
  }

  it("второй просит историю: ходы и путь пальца есть, лиц чужой руки нет", { timeout: 20000 }, async () => {
    const room = mintRoom(SECRET);
    const a = await sit(room, 51, "Аня");
    const b = await sit(room, 52, "Боря");
    const mine = a.welcome.snapshot.chairs.find((c) => c.owner === a.welcome.you.key)!.id;
    const top = a.welcome.snapshot.piles[0]!.cards.at(-1)!.id;
    // Аня берёт карту в свою руку (скрытую от Бори), потом тащит другую по сукну и кладёт.
    a.client.send(MSG.intent, { t: "grab", id: top });
    a.client.send(MSG.intent, { t: "drop", id: top, to: { in: "hand", chair: mine, i: 0 } });
    await wait(150);
    const second = a.welcome.snapshot.piles[0]!.cards.at(-2)!.id;
    a.client.send(MSG.intent, { t: "grab", id: second });
    for (let i = 0; i < 12; i++) { a.client.send(MSG.carry, { id: second, over: { in: "felt", x: i * 0.4, y: Math.sin(i / 2), up: false, angle: 0 } }); await wait(60); }
    a.client.send(MSG.intent, { t: "drop", id: second, to: { in: "felt", x: 5, y: 1, up: true, angle: 0 } });
    await wait(400);
    const page = next<History | HistoryNone>(b.client, MSG.history);
    b.client.send(MSG.history, { before: Date.now() + 100 });
    const got = (await page) as History;
    expect("none" in got).toBe(false);
    expect(got.events.some((e) => "ops" in e)).toBe(true);
    const path = got.events.find((e) => "path" in e) as { at: number; path: { id: string; by: string; pts: unknown[] } } | undefined;
    expect(path?.path).toMatchObject({ id: second, by: a.welcome.you.key });
    expect(path!.path.pts.length).toBeGreaterThanOrEqual(2);
    // Карта в закрытой руке Ани: её лица в истории Бори нет (ни в кадре, ни в ходах).
    const text = JSON.stringify(got);
    const handFace = deedsOf(room, 500).filter((d) => d.kind === "patch").map((d) => JSON.stringify(d.what)).join("").includes(`"id":"${top}","face"`);
    expect(handFace, "в журнале (правде) лицо есть").toBe(true);
    expect(text.includes(`"id":"${top}","face"`), "лицо чужой руки утекло").toBe(false);
  });

  it("раньше первого кадра — ничего", async () => {
    const room = mintRoom(SECRET);
    const a = await sit(room, 53, "Вера");
    const page = next<History | HistoryNone>(a.client, MSG.history);
    a.client.send(MSG.history, { before: 1 });
    expect((await page) as HistoryNone).toMatchObject({ none: true });
  });
});
