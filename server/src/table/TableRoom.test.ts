import { addSticker } from "../db/stickersRepo.js";
import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { TEST_PORTS, useTestServer } from "../roomHarness.js";
import { MSG, PROTOCOL, STALE_CLIENT, TABLE_ROOM, type Carry, type Patch, type Refused, type Welcome } from "./contract.js";
import { mintRoom } from "./roomIds.js";
import { applyPatch } from "./patch.js";
import { findEntry, keepLobbyIn, openEntry, runIn } from "./lobby.js";
import { dropRoom, keepCard, keepState, keptRooms, keptState } from "../db/tableRoomsRepo.js";
import { BOT_KEY } from "./botPerson.js";
import type { Say, Shot } from "./say.js";
import { PULSE_EVERY_MS, type Pulse } from "./freshness.js";

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

  it("отказ в дропе: отказнику — причина, соседу — карта отпущена, и стол у него не отстал", async () => {
    const room = mintRoom(SECRET);
    const a = await sit(room, { door: "guest", name: "Аня" });
    const b = await sit(room, { door: "guest", name: "Боря" });
    const his = b.welcome.snapshot.people.find((p) => p.key === b.welcome.you.key)!.seat!;
    b.client.send(MSG.intent, { t: "flag", chair: his, flag: "reject", on: true });
    const top = a.welcome.snapshot.piles[0]!.cards.at(-1)!.id;
    a.client.send(MSG.intent, { t: "grab", id: top });
    const carried = next<Carry>(b.client, MSG.carry);
    await new Promise((r) => setTimeout(r, 50));
    a.client.send(MSG.carry, { id: top, over: { in: "hand", chair: his, i: 0 } });
    expect((await carried).id).toBe(top);

    const refused = next<Refused>(a.client, MSG.refused);
    a.client.send(MSG.intent, { t: "drop", id: top, to: { in: "hand", chair: his, i: 0 } });
    expect((await refused).why).toBe("chair-locked");
    await new Promise((r) => setTimeout(r, 50));
    const seen = b.patches.reduce(applyPatch, b.welcome.snapshot);
    expect(seen.locks[top]).toBeUndefined();
    expect(b.patches.at(-1)!.ops).toContainEqual({ t: "unlock", id: top });
  });

  it("пульс: сервер сам называет версию стола, и она та же, что у снимка", async () => {
    const room = mintRoom(SECRET);
    const a = await sit(room, { door: "guest", name: "Аня" });
    const pulse = await next<Pulse>(a.client, MSG.pulse);
    expect(pulse.v).toBe(a.patches.reduce(applyPatch, a.welcome.snapshot).v);
  }, PULSE_EVERY_MS + 3000);

  it("комната переживает остановку: карты лежат, где лежали, и человек садится на свой стул", async () => {
    keepLobbyIn({ card: keepCard, drop: dropRoom, all: keptRooms, state: keepState, stateOf: keptState });
    try {
      const room = mintRoom(SECRET);
      openEntry(room, { kind: "inline", message: "m" }, "tg:7", "Живучий");
      const a = await sit(room, { door: "telegram", initData: initData(7, "Аня") });
      const mine = a.welcome.snapshot.people.find((p) => p.key === "tg:7")!.seat!;
      const top = a.welcome.snapshot.piles[0]!.cards.at(-1)!.id;
      a.client.send(MSG.intent, { t: "grab", id: top });
      a.client.send(MSG.intent, { t: "drop", id: top, to: { in: "hand", chair: mine, i: 0 } });
      // Замок уход со стула снимает сам (`vacate`) — это закон стола, а не слепка; «отклонять» уход переживает.
      a.client.send(MSG.intent, { t: "flag", chair: mine, flag: "reject", on: true });
      // Игроки без человека — часть стола: им возвращаться неоткуда, они остаются сидеть.
      await runIn(room, "tg:7", { t: "bots", n: 2 });
      await new Promise((r) => setTimeout(r, 80));
      const before = a.patches.reduce(applyPatch, a.welcome.snapshot);
      const botsAt = (s: typeof before) => s.people.filter((p) => p.bot && p.key.startsWith("bot:игрок")).map((p) => [p.key, p.seat]).sort();
      expect(botsAt(before)).toHaveLength(2);

      // Процесс останавливают: комната Colyseus гаснет, запись остаётся.
      await server().getRoomById(a.client.roomId).disconnect();
      await new Promise((r) => setTimeout(r, 80));

      const b = await sit(room, { door: "telegram", initData: initData(7, "Аня") });
      const after = b.welcome.snapshot;
      expect(b.client.roomId).not.toBe(a.client.roomId);
      expect(after.people.find((p) => p.key === "tg:7")!.seat).toBe(mine);
      const chair = after.chairs.find((c) => c.id === mine)!;
      expect(chair.hand.map((h) => h.id)).toEqual([top]);
      expect(chair.reject).toBe(true);
      expect(after.piles[0]!.cards).toHaveLength(before.piles[0]!.cards.length);
      expect(after.v).toBeGreaterThan(before.v);
      expect(botsAt(after)).toEqual(botsAt(before));
      expect(b.welcome.title).toBe("Живучий");
    } finally {
      keepLobbyIn(null);
    }
  });

  it("команда bots — состав стола: не распорядителю отказ; в делах крупье её нет", async () => {
    const room = mintRoom(SECRET);
    openEntry(room, { kind: "inline", message: "m" }, "tg:7", "С ботами");
    const owner = await sit(room, { door: "telegram", initData: initData(7, "Аня") });
    const guest = await sit(room, { door: "guest", name: "Боря" });
    expect(owner.welcome.crew.map((act) => act.id)).not.toEqual(expect.arrayContaining(["bot-add"]));
    expect(await runIn(room, guest.welcome.you.key, { t: "bots", n: 1 })).toEqual({ error: "not-admin" });
    const bots = () => owner.patches.reduce(applyPatch, owner.welcome.snapshot).people.filter((p) => p.bot && p.seat !== undefined && p.key.startsWith("bot:игрок"));
    await runIn(room, "tg:7", { t: "bots", n: 2 });
    await new Promise((r) => setTimeout(r, 120));
    expect(bots()).toHaveLength(2);
  });

  it("состав колоды из окна крупье: 36 ↔ 52 и джокеры — недостающие прилетают крупье в руки, лишние уходят", async () => {
    const room = mintRoom(SECRET);
    openEntry(room, { kind: "inline", message: "m" }, "tg:7", "Колода");
    const owner = await sit(room, { door: "telegram", initData: initData(7, "Аня") });
    const guest = await sit(room, { door: "guest", name: "Боря" });
    await runIn(room, "tg:7", { t: "croupier", on: true });
    await new Promise((r) => setTimeout(r, 80));
    const state = () => owner.patches.reduce(applyPatch, owner.welcome.snapshot);
    const everyCard = () => {
      const s = state();
      return [...s.piles.flatMap((p) => p.cards), ...s.felt, ...s.chairs.flatMap((c) => c.hand)];
    };
    const croupierHand = () => state().chairs.find((c) => c.croupier)!.hand.length;
    expect(everyCard()).toHaveLength(36);

    guest.client.send(MSG.intent, { t: "crew", act: "deck" });
    await new Promise((r) => setTimeout(r, 200));
    expect(everyCard(), "не распорядителю состав колоды не менять").toHaveLength(36);

    owner.client.send(MSG.intent, { t: "crew", act: "deck" });
    await new Promise((r) => setTimeout(r, 400));
    expect(everyCard()).toHaveLength(52);
    expect(croupierHand(), "шестнадцать новых — в руках крупье").toBe(16);

    owner.client.send(MSG.intent, { t: "crew", act: "jokers" });
    await new Promise((r) => setTimeout(r, 400));
    expect(everyCard()).toHaveLength(54);
    expect(croupierHand()).toBe(18);

    owner.client.send(MSG.intent, { t: "crew", act: "deck" });
    await new Promise((r) => setTimeout(r, 400));
    expect(everyCard(), "лишние ушли, джокеры остались").toHaveLength(38);
    expect(croupierHand()).toBe(2);

    owner.client.send(MSG.intent, { t: "crew", act: "jokers" });
    await new Promise((r) => setTimeout(r, 400));
    expect(everyCard()).toHaveLength(36);
    expect(croupierHand()).toBe(0);
  });

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
    // Крупье сидит в комнате с самого начала — он часть стола, а не гость.
    expect(b.welcome.snapshot.people.map((p) => p.name)).toEqual(["CrossaderBot", "A", "B"]);
    expect(b.welcome.snapshot.chairs.filter((c) => c.croupier)).toHaveLength(1);

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
    // Он же крупье: у него своё место вне кольца, и карт при раздаче он не получает.
    const his = mine.chairs.find((c) => c.croupier)!;
    expect(mine.people.find((p) => p.key === BOT_KEY)!.seat).toBe(his.id);
    expect(his.hand).toHaveLength(0);
    expect(mine.chairs.filter((c) => !c.croupier).map((c) => c.hand.length)).toEqual([2, 2]);
    expect(carries.length).toBeGreaterThanOrEqual(4);
    expect(carries[0]).toMatchObject({ by: BOT_KEY, auto: true });
    expect(await runIn(room, "tg:7", { t: "deal", rule: "each", n: 2 })).toEqual({ error: "needs-collect" });
  });

  it("ПЕРЕРАЗДАЧА: до первой раздачи её нет, потом — одним нажатием, теми же стульями", async () => {
    const room = mintRoom(SECRET);
    openEntry(room, { kind: "chat", chat: "-1" }, "tg:9");
    const a = await sit(room, { door: "telegram", initData: initData(9, "Админ") });
    const b = await sit(room, { door: "guest", name: "B" });
    // Повторять нечего: раздачи ещё не было, и комната говорит это словом, а не молчит.
    expect(await runIn(room, "tg:9", { t: "redeal" })).toEqual({ error: "no-deal-yet" });
    const seats = b.welcome.snapshot.chairs.filter((c) => !c.croupier).map((c) => c.id);
    expect(seats).toHaveLength(2);
    expect(await runIn(room, "tg:9", { t: "deal", rule: "each", n: 2, seats: [seats[0]!] })).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 2 * 150 + 500));
    // Одно нажатие: карты со стола собираются и мешаются сами, а стулья берутся из прошлой раздачи.
    expect(await runIn(room, "tg:9", { t: "redeal" })).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 7000));
    let mine = b.welcome.snapshot;
    for (const p of b.patches.filter((p) => p.v > mine.v)) mine = applyPatch(mine, p);
    const hands: Record<string,number> = Object.fromEntries(mine.chairs.filter((c) => !c.croupier).map((c) => [c.id, c.hand.length]));
    expect(hands[seats[0]!], "раздали тому же стулу").toBe(2);
    expect(hands[seats[1]!], "а тому, кого в прошлой раздаче не было, — не раздали").toBe(0);
  }, 20000);

  it("РАССАДКА ИЗ ЧАТА: чужому отказ; выгнанный уходит вместе со своим пустым стулом, новый стул встаёт", async () => {
    const room = mintRoom(SECRET);
    openEntry(room, { kind: "chat", chat: "-1" }, "tg:11");
    const a = await sit(room, { door: "telegram", initData: initData(11, "Админ") });
    const b = await sit(room, { door: "telegram", initData: initData(12, "Гость") });
    await new Promise((r) => setTimeout(r, 120));
    const his = findEntry(room)!.seats.find((s) => s.who?.key === "tg:12")!;
    expect(his.cards, "карт у него нет").toBe(0);
    // Рассадка — дело распорядителя: чужому отказ, а не тихое «ок».
    expect(await runIn(room, "tg:12", { t: "seat", do: "kick", chair: his.id })).toEqual({ error: "not-admin" });
    expect(await runIn(room, "tg:11", { t: "seat", do: "kick", chair: his.id })).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 200));
    expect(findEntry(room)!.people.map((p) => p.key), "выгнанного в комнате нет").not.toContain("tg:12");
    expect(findEntry(room)!.seats.map((s) => s.id), "и пустой стул ушёл за ним").not.toContain(his.id);
    const was = findEntry(room)!.seats.length;
    expect(await runIn(room, "tg:11", { t: "seat", do: "add" })).toEqual({ ok: true });
    expect(findEntry(room)!.seats).toHaveLength(was + 1);
    // Раздающий — тоже рассадка: роль видна в той же карточке.
    const mine = findEntry(room)!.seats.find((s) => s.who?.key === "tg:11")!;
    expect(await runIn(room, "tg:11", { t: "seat", do: "dealer", chair: mine.id })).toEqual({ ok: true });
    expect(findEntry(room)!.seats.find((s) => s.id === mine.id)!.dealer).toBe(true);
    // ПЕРЕСАДКА — стулья меняются местами вместе с людьми: порядок в рассадке переворачивается.
    const before = findEntry(room)!.seats.map((s) => s.id);
    expect(await runIn(room, "tg:11", { t: "seat", do: "swap", chair: before[0]!, with: before[1]! })).toEqual({ ok: true });
    const after = findEntry(room)!.seats.map((s) => s.id);
    expect(after.slice(0, 2)).toEqual([before[1], before[0]]);
    // РАССАДКА РУКОЙ: названным стульям — их углы, как поставил распорядитель; чужого стула в списке нет.
    const [p, q] = after;
    expect(await runIn(room, "tg:11", { t: "seat", do: "place", chairs: [{ chair: p!, angle: 30 }, { chair: q!, angle: 300 }, { chair: "nope", angle: 5 }] })).toEqual({ ok: true });
    expect(await runIn(room, "tg:12", { t: "seat", do: "place", chairs: [{ chair: p!, angle: 90 }] })).toEqual({ error: "not-admin" });
    void a;
    void b;
  }, 15000);
});
