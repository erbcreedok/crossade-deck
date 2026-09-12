// СТОРОЖ `rooms.a-closed-table-is-not-replaced-by-a-new-one`.
//
// Прежде ссылка `#cards?room=0244` на закрывшийся стол молча открывала НОВЫЙ: человек думал, что
// пришёл к друзьям, а сидел один за пустым столом с тем же кодом. Здесь проверяется, что двери
// говорят правду — «стол закрылся», — и что вечная комната переживает пустоту вместе со своим кодом.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createApp } from "./app.js";

vi.mock("fs", () => ({
  existsSync: () => false,
  readFileSync: () => "[]",
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const PORT = 2691;
const BASE = `http://localhost:${PORT}`;

let httpServer: ReturnType<typeof createApp>["httpServer"];

beforeAll(async () => {
  ({ httpServer } = createApp());
  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

const post = (path: string, body?: unknown) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

async function account(): Promise<{ id: string; recoveryHash: string }> {
  return (await (await post("/accounts")).json()) as { id: string; recoveryHash: string };
}

async function open(body: Record<string, unknown> = {}) {
  const res = await post("/rooms", { game: "cards", ...body });
  return { res, body: (await res.json()) as Record<string, string> };
}

describe("rooms.a-closed-table-is-not-replaced-by-a-new-one", () => {
  it("открытый стол находится по своему коду", async () => {
    const { body } = await open();
    expect(body.code).toMatch(/^[23456789ACDEFHJKLMNPQRTUVWXY]{4}$/);

    const found = (await (await fetch(`${BASE}/rooms/by-code/${body.code}`)).json()) as Record<string, string>;
    expect(found.room).toBe(body.room);
    expect(found.game).toBe("cards");
  });

  it("закрытый стол отвечает «закрылся», а не новым столом", async () => {
    const me = await account();
    const { body } = await open({ by: me.id });

    await fetch(`${BASE}/rooms/${body.room}?by=${me.id}`, { method: "DELETE" });

    const peek = await fetch(`${BASE}/rooms/by-code/${body.code}`);
    expect(peek.status).toBe(404);
    expect((await peek.json()).error).toBe("room_closed");

    const sit = await post("/rooms/join", { code: body.code });
    expect(sit.status).toBe(404);
  });

  it("вход по коду ведёт в ТУ ЖЕ комнату, а не в одноимённую новую", async () => {
    const { body } = await open();
    const first = (await (await post("/rooms/join", { code: body.code })).json()) as Record<string, string>;
    const second = (await (await post("/rooms/join", { code: body.code })).json()) as Record<string, string>;
    expect(first.room).toBe(body.room);
    expect(second.room).toBe(body.room);
    expect(second.roomId).toBe(first.roomId);
  });

  it("закрыть стол может только хозяин", async () => {
    const me = await account();
    const stranger = await account();
    const { body } = await open({ by: me.id });

    const denied = await fetch(`${BASE}/rooms/${body.room}?by=${stranger.id}`, { method: "DELETE" });
    expect(denied.status).toBe(403);
    expect((await fetch(`${BASE}/rooms/by-code/${body.code}`)).status).toBe(200);

    const allowed = await fetch(`${BASE}/rooms/${body.room}?by=${me.id}`, { method: "DELETE" });
    expect(allowed.status).toBe(200);
  });

  it("стол помнит свой уклад и свою вечность", async () => {
    const { body } = await open({ mode: "council", forever: true, seats: 6 });
    const found = (await (await fetch(`${BASE}/rooms/by-code/${body.code}`)).json()) as Record<string, unknown>;
    expect(found.mode).toBe("council");
    expect(found.forever).toBe(true);
    expect(found.seats).toBe(6);
  });

  it("свой код берут, если он свободен", async () => {
    const { body } = await open({ code: "maft" });
    expect(body.code).toBe("MAFT");
    const second = await open({ code: "MAFT" });
    expect(second.body.code).not.toBe("MAFT");
  });

  it("уклада, которого нет, не бывает", async () => {
    expect((await post("/rooms", { game: "cards", mode: "диктатура" })).status).toBe(400);
  });

  it("игра, которой нет, стола не заводит", async () => {
    expect((await post("/rooms", { game: "шашки" })).status).toBe(400);
    expect((await post("/rooms", { game: "cards", visibility: "секретная" })).status).toBe(400);
  });
});

describe("поиск столов", () => {
  it("публичный виден, скрытый — нет", async () => {
    const me = await account();
    const seen = await open({ by: me.id, visibility: "public", title: "заходите" });
    const hidden = await open({ by: me.id, visibility: "hidden" });

    const list = (await (await fetch(`${BASE}/rooms?game=cards`)).json()) as Record<string, string>[];
    const ids = list.map((one) => one.room);
    expect(ids).toContain(seen.body.room);
    expect(ids).not.toContain(hidden.body.room);

    // И БЕЗ ВОПРОСА ПРО ИГРУ — ТОТ ЖЕ ОТВЕТ. Список без игры проверяется отдельно: правда о
    // видимости не должна зависеть от того, спросили ли заодно про игру.
    const all = (await (await fetch(`${BASE}/rooms`)).json()) as Record<string, string>[];
    expect(all.map((one) => one.room)).toContain(seen.body.room);
    expect(all.map((one) => one.room)).not.toContain(hidden.body.room);
  });

  it("скрытая комната остаётся в списке своих", async () => {
    const me = await account();
    const hidden = await open({ by: me.id, visibility: "hidden" });

    const mine = (await (await fetch(`${BASE}/accounts/${me.id}/rooms`)).json()) as Record<string, unknown>[];
    expect(mine.map((one) => one.room)).toContain(hidden.body.room);
    expect(mine.find((one) => one.room === hidden.body.room)?.own).toBe(true);
  });

  it("в списке нет ключей: ни номера хозяина, ни номеров людей", async () => {
    const me = await account();
    await open({ by: me.id });
    const list = (await (await fetch(`${BASE}/rooms`)).json()) as Record<string, unknown>[];
    for (const one of list) {
      expect(one).not.toHaveProperty("ownerAccount");
      // Хозяин виден ИМЕНЕМ — «стол Марата» человек узнаёт, а номер аккаунта ему ничего не говорит
      // и является ключом.
      expect(one).toHaveProperty("owner");
      for (const person of (one.people ?? []) as Record<string, unknown>[]) {
        expect(person).not.toHaveProperty("accountId");
      }
    }
  });

  it("свои столы приходят в том же списке и помечены группой", async () => {
    const me = await account();
    const own = await open({ by: me.id, visibility: "hidden", forever: true });

    const list = (await (await fetch(`${BASE}/rooms?me=${me.id}`)).json()) as Record<string, unknown>[];
    const row = list.find((one) => one.room === own.body.room);
    expect(row?.group).toBe("forever");
    expect(row?.mySeat).toBe(true);

    // ...и чужому та же комната не видна вовсе.
    const stranger = await account();
    const theirs = (await (await fetch(`${BASE}/rooms?me=${stranger.id}`)).json()) as Record<string, unknown>[];
    expect(theirs.map((one) => one.room)).not.toContain(own.body.room);
  });
});

// СТОРОЖ `rooms.a-table-that-is-not-forever-closes-with-its-session`.
//
// Вечность — выбор хозяина, а не свойство машинерии. Невечный стол, оставшийся стоять после ухода
// последнего, копит мусор: список за неделю зарастает пустыми комнатами, и его перестают читать.
describe("rooms.a-table-that-is-not-forever-closes-with-its-session", () => {
  it("невечный закрывается вместе с сессией и отдаёт код, вечный — стоит", async () => {
    const { sessionEnded } = await import("./rooms.js");
    const once = await open({ forever: false });
    const always = await open({ forever: true });

    sessionEnded(once.body.room!);
    sessionEnded(always.body.room!);

    expect((await fetch(`${BASE}/rooms/by-code/${once.body.code}`)).status).toBe(404);
    expect((await fetch(`${BASE}/rooms/by-code/${always.body.code}`)).status).toBe(200);
  });
});

// СТОРОЖ `rooms.the-code-is-in-your-hand-before-the-table-exists`.
//
// Комнату зовут кодом, и по стенду его показывают ДО нажатия «Создать»: его отправляют другу, ещё
// не сев за стол. Значит между «дай код» и «открой комнату» проходят минуты — и всё это время код
// должен быть занят, иначе друг придёт не за тот стол.
describe("rooms.the-code-is-in-your-hand-before-the-table-exists", () => {
  it("код выдают до комнаты, и второму его уже не дадут", async () => {
    const { code } = (await (await post("/rooms/code")).json()) as { code: string };
    expect(code).toMatch(/^[23456789ACDEFHJKLMNPQRTUVWXY]{4}$/);

    const free = (await (await fetch(`${BASE}/rooms/code/${code}`)).json()) as { free: boolean };
    expect(free.free).toBe(false);

    // ...и случайная выдача его тоже обходит.
    for (let n = 0; n < 20; n++) {
      const next = (await (await post("/rooms/code")).json()) as { code: string };
      expect(next.code).not.toBe(code);
    }
  });

  it("выданным кодом открывается именно та комната, которую обещали", async () => {
    const { code } = (await (await post("/rooms/code")).json()) as { code: string };
    const made = await open({ code });
    expect(made.body.code).toBe(code);
  });

  it("свободный код так и называется свободным", async () => {
    const free = (await (await fetch(`${BASE}/rooms/code/MAFT2`)).json()) as { free: boolean };
    expect(free.free).toBe(true);
    const bad = (await (await fetch(`${BASE}/rooms/code/0000`)).json()) as { free: boolean };
    expect(bad.free).toBe(false);
  });
});

// СТОРОЖ `rooms.the-turn-is-told-only-to-whose-turn-it-is`.
//
// Метка «твой ход» — единственное, ради чего список комнат открывают заново. Но чужая очередь не
// дело постороннего: посторонний видит, что за столом идёт игра, и не видит, кого именно ждут.
describe("rooms.the-turn-is-told-only-to-whose-turn-it-is", () => {
  it("ждут одного — метку видит он один", async () => {
    const { setTurn } = await import("./roomPeople.js");
    const me = await account();
    const you = await account();
    const { body } = await open({ by: me.id });

    setTurn(body.room!, me.id);

    const mineRow = ((await (await fetch(`${BASE}/rooms?me=${me.id}`)).json()) as Record<string, unknown>[])
      .find((one) => one.room === body.room);
    expect(mineRow?.myTurn).toBe(true);

    const theirs = ((await (await fetch(`${BASE}/rooms?me=${you.id}`)).json()) as Record<string, unknown>[])
      .find((one) => one.room === body.room);
    expect(theirs?.myTurn).toBeUndefined();
  });
});
