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
    expect(body.code).toMatch(/^\d{4}$/);

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
  });

  it("скрытая комната остаётся в списке своих", async () => {
    const me = await account();
    const hidden = await open({ by: me.id, visibility: "hidden" });

    const mine = (await (await fetch(`${BASE}/accounts/${me.id}/rooms`)).json()) as Record<string, unknown>[];
    expect(mine.map((one) => one.room)).toContain(hidden.body.room);
    expect(mine.find((one) => one.room === hidden.body.room)?.own).toBe(true);
  });

  it("в списке нет чужих секретов: ни хозяина, ни людей комнаты", async () => {
    const me = await account();
    await open({ by: me.id });
    const list = (await (await fetch(`${BASE}/rooms`)).json()) as Record<string, unknown>[];
    for (const one of list) {
      expect(one).not.toHaveProperty("ownerAccount");
      expect(one).not.toHaveProperty("members");
    }
  });
});
