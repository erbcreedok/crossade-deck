import { addSticker } from "../db/stickersRepo.js";
import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { TEST_PORTS, useTestServer } from "../roomHarness.js";
import { MSG, TABLE_ROOM, type Carry, type Patch, type Refused, type Welcome } from "./contract.js";
import { mintRoom } from "./roomIds.js";
import { applyPatch } from "./patch.js";
import { openEntry, runIn } from "./lobby.js";
import { BOT_KEY } from "./botPerson.js";
import type { Say, Shot } from "./say.js";

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
    expect(welcome.snapshot.piles[0]!.cards).toHaveLength(36);
    expect(welcome.snapshot.piles[0]!.cards.every((card) => card.face === undefined)).toBe(true);
  });

  it("один id — одна комната; взятое одним у другого отказано; дифы сходятся со столом", async () => {
    const room = mintRoom(SECRET);
    const a = await sit(room, { door: "guest", name: "A" });
    const b = await sit(room, { door: "guest", name: "B" });
    expect(b.welcome.snapshot.people.map((p) => p.name)).toEqual(["A", "B"]);

    const top = a.welcome.snapshot.piles[0]!.cards.at(-1)!.id;
    a.client.send(MSG.intent, { t: "grab", id: top });
    await new Promise((r) => setTimeout(r, 60));
    const refused = next<Refused>(b.client, MSG.refused);
    b.client.send(MSG.intent, { t: "grab", id: top });
    expect((await refused).why).toBe("locked");

    a.client.send(MSG.intent, { t: "drop", id: top, to: { in: "hand", chair: a.welcome.you.seat, i: 0 } });
    await new Promise((r) => setTimeout(r, 80));

    // b сложил у себя всё, что пришло после его welcome, — и это ровно то, что сервер отдаст ему целиком.
    let mine = b.welcome.snapshot;
    for (const p of b.patches.filter((p) => p.v > mine.v)) mine = applyPatch(mine, p);
    const fresh = next<Welcome>(b.client, MSG.welcome);
    b.client.send(MSG.intent, { t: "sync" });
    expect(mine).toEqual((await fresh).snapshot);
    // ПАЛЕЦ В ВОЗДУХЕ: b видит, над чем карта у a; сам a своё обратно не получает.
    a.client.send(MSG.intent, { t: "grab", id: top });
    await new Promise((r) => setTimeout(r, 60));
    let echoed = false;
    a.client.onMessage(MSG.carry, () => (echoed = true));
    const carried = next<Carry>(b.client, MSG.carry);
    a.client.send(MSG.carry, { id: top, over: { in: "felt", x: 1, y: 1, up: false, angle: 0 } });
    expect(await carried).toMatchObject({ id: top, by: a.welcome.you.key, from: { in: "hand" }, card: { id: top } });
    await new Promise((r) => setTimeout(r, 60));
    expect(echoed).toBe(false);

    expect(mine.chairs.find((c) => c.id === a.welcome.you.seat)!.hand).toEqual([{ id: top }]);
  });

  it("строка у стула: остальным с автором, себе не эхом; чужие символы и лишние буквы — никому", async () => {
    const room = mintRoom(SECRET);
    const a = await sit(room, { door: "guest", name: "A" });
    const b = await sit(room, { door: "guest", name: "B" });
    const heard: Say[] = [];
    let echoed = false;
    b.client.onMessage(MSG.say, (say: Say) => heard.push(say));
    a.client.onMessage(MSG.say, () => (echoed = true));
    const line = (text: string) => [{ t: "text", text }];
    a.client.send(MSG.say, { n: 1, pieces: line("<script>") });
    a.client.send(MSG.say, { n: 1, pieces: line("A".repeat(40)) });
    a.client.send(MSG.say, { n: 1, text: "ПРИВЕТ" });
    a.client.send(MSG.say, { n: 1, pieces: [...line("ПРИВЕТ😀 "), { t: "who", key: b.welcome.you.key }] });
    a.client.send(MSG.say, { n: 1, pieces: line("ПРИВЕТ😀"), done: true });
    await new Promise((r) => setTimeout(r, 120));
    expect(heard).toEqual([
      { n: 1, pieces: [...line("ПРИВЕТ😀 "), { t: "who", key: b.welcome.you.key }], by: a.welcome.you.key },
      { n: 1, pieces: line("ПРИВЕТ😀"), done: true, by: a.welcome.you.key },
    ]);
    expect(echoed).toBe(false);
  });

  it("стикер выстрелом — только из своего набора и не больше трёх в полёте; свой набор приходит только себе", async () => {
    const room = mintRoom(SECRET);
    const a = await sit(room, { door: "guest", name: "A" });
    const b = await sit(room, { door: "guest", name: "B" });
    const mine = addSticker(a.welcome.you.key, Buffer.from("RIFF0000WEBP"), "image/webp");
    const theirs = addSticker(b.welcome.you.key, Buffer.from("RIFF0000WEBP"), "image/webp");
    if (mine === "full" || theirs === "full") throw new Error("full");
    const heard: Say[] = [];
    const shots: Shot[] = [];
    b.client.onMessage(MSG.say, (say: Say) => heard.push(say));
    b.client.onMessage(MSG.shot, (shot: Shot) => shots.push(shot));
    const listed: string[][] = [];
    a.client.onMessage(MSG.stickers, (ids: string[]) => listed.push(ids));
    a.client.send(MSG.shot, { id: theirs.id });
    for (let i = 0; i < 5; i += 1) a.client.send(MSG.shot, { id: mine.id });
    a.client.send(MSG.stickers, {});
    await new Promise((r) => setTimeout(r, 120));
    expect(heard).toEqual([]);
    expect(shots).toEqual([1, 2, 3].map(() => ({ id: mine.id, by: a.welcome.you.key })));
    expect(listed).toEqual([[mine.id]]);
  });

  it("команда админа: чужому — отказ; админу — бот садится без стула и раздаёт по часовой, курсор видят все", async () => {
    const room = mintRoom(SECRET);
    openEntry(room, { kind: "chat", chat: "-1" }, "tg:7");
    expect(await runIn(room, "tg:7", { t: "collect" })).toEqual({ error: "empty" });
    const a = await sit(room, { door: "telegram", initData: initData(7, "Админ") });
    const b = await sit(room, { door: "guest", name: "B" });
    expect(await runIn(room, "tg:8", { t: "deal", rule: "each", n: 2 })).toEqual({ error: "not-admin" });
    const carries: Carry[] = [];
    a.client.onMessage(MSG.carry, (c: Carry) => carries.push(c));
    expect(await runIn(room, "tg:7", { t: "deal", rule: "each", n: 2 })).toEqual({ ok: true });
    expect(await runIn(room, "tg:7", { t: "shuffle" })).toEqual({ error: "busy" });
    await new Promise((r) => setTimeout(r, 4 * 150 + 400));
    let mine = b.welcome.snapshot;
    for (const p of b.patches.filter((p) => p.v > mine.v)) mine = applyPatch(mine, p);
    expect(mine.people.find((p) => p.key === BOT_KEY)).toMatchObject({ bot: true });
    expect(mine.people.find((p) => p.key === BOT_KEY)!.seat).toBeUndefined();
    expect(mine.chairs.map((c) => c.hand.length)).toEqual([2, 2]);
    expect(carries.length).toBeGreaterThanOrEqual(4);
    expect(carries[0]).toMatchObject({ by: BOT_KEY, auto: true });
    expect(await runIn(room, "tg:7", { t: "deal", rule: "each", n: 2 })).toEqual({ error: "needs-collect" });
  });
});
