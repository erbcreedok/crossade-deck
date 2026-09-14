import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { TEST_PORTS, useTestServer } from "../roomHarness.js";
import { MSG, TABLE_ROOM, type Patch, type Refused, type Welcome } from "./contract.js";
import { mintRoom } from "./roomIds.js";
import { applyPatch } from "./patch.js";

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

describe("TableRoom", () => {
  const server = useTestServer(TEST_PORTS.table);

  async function sit(room: string, options: Record<string, unknown>) {
    const client = await server().sdk.joinOrCreate(TABLE_ROOM, { room, client: "html", ...options });
    const patches: Patch[] = [];
    client.onMessage(MSG.patch, (p: Patch) => patches.push(p));
    const welcome = next<Welcome>(client, MSG.welcome);
    client.send(MSG.hello);
    return { client, welcome: await welcome, patches };
  }

  it("без подписи комнату не открыть, без двери — не войти", async () => {
    await expect(server().sdk.joinOrCreate(TABLE_ROOM, { room: "x".repeat(22), door: "guest" })).rejects.toThrow();
    await expect(server().sdk.joinOrCreate(TABLE_ROOM, { room: mintRoom(SECRET), door: "telegram", initData: "hash=00" })).rejects.toThrow();
  });

  it("Telegram-дверь: имя из подписанной initData, ключ — номер в Telegram", async () => {
    const { welcome } = await sit(mintRoom(SECRET), { door: "telegram", initData: initData(42, "Ербол") });
    expect(welcome.you).toMatchObject({ key: "tg:42", name: "Ербол", door: "telegram" });
    expect(welcome.snapshot.deck).toHaveLength(36);
    expect(welcome.snapshot.deck.every((card) => card.face === undefined)).toBe(true);
  });

  it("один id — одна комната; взятое одним у другого отказано; дифы сходятся со столом", async () => {
    const room = mintRoom(SECRET);
    const a = await sit(room, { door: "guest", name: "A" });
    const b = await sit(room, { door: "guest", name: "B" });
    expect(b.welcome.snapshot.people.map((p) => p.name)).toEqual(["A", "B"]);

    const top = a.welcome.snapshot.deck.at(-1)!.id;
    a.client.send(MSG.intent, { t: "grab", id: top });
    await new Promise((r) => setTimeout(r, 60));
    const refused = next<Refused>(b.client, MSG.refused);
    b.client.send(MSG.intent, { t: "grab", id: top });
    expect((await refused).why).toBe("locked");

    a.client.send(MSG.intent, { t: "drop", id: top, to: { in: "hand", who: a.welcome.you.key, i: 0 } });
    await new Promise((r) => setTimeout(r, 80));

    // b сложил у себя всё, что пришло после его welcome, — и это ровно то, что сервер отдаст ему целиком.
    let mine = b.welcome.snapshot;
    for (const p of b.patches.filter((p) => p.v > mine.v)) mine = applyPatch(mine, p);
    const fresh = next<Welcome>(b.client, MSG.welcome);
    b.client.send(MSG.intent, { t: "sync" });
    expect(mine).toEqual((await fresh).snapshot);
    expect(mine.hands[a.welcome.you.key]).toEqual([{ id: top }]);
  });
});
