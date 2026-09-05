import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createHmac } from "crypto";
import { createApp } from "./app.js";

// Изолируем от диска, как accounts.test.ts — иначе /auth/telegram и /accounts тестов
// пишут в общий server/data/accounts.json.
vi.mock("fs", () => ({
  existsSync: () => false,
  readFileSync: () => "[]",
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const PORT = 2680;
const BASE = `http://localhost:${PORT}`;
const BOT_TOKEN = "test-bot-token";

let httpServer: ReturnType<typeof createApp>["httpServer"];

beforeAll(async () => {
  ({ httpServer } = createApp());
  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

beforeEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
});

function buildInitData(fields: Record<string, string>, botToken = BOT_TOKEN): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

function telegramFields(userId: number, authDate = Math.floor(Date.now() / 1000)) {
  return {
    auth_date: String(authDate),
    user: JSON.stringify({ id: userId, first_name: "Alice", username: "alice_tg" }),
  };
}

describe("POST /rooms", () => {
  it("создаёт kit_room под игру и отдаёт код и roomId", async () => {
    const res = await fetch(`${BASE}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "nardy" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.game).toBe("nardy");
    expect(typeof body.roomId).toBe("string");
    expect(body.code).toMatch(/^\d{4}$/);
  });

  it("400 на неизвестную игру", async () => {
    const res = await fetch(`${BASE}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "monopoly" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /rooms/by-code/:code", () => {
  it("отдаёт game вместе с roomId для стола, созданного через /rooms", async () => {
    const created = await fetch(`${BASE}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "chess" }),
    }).then((r) => r.json());

    const res = await fetch(`${BASE}/rooms/by-code/${created.code}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.roomId).toBe(created.roomId);
    expect(body.game).toBe("chess");
  });

  it("404 на несуществующий код", async () => {
    const res = await fetch(`${BASE}/rooms/by-code/0000`);
    expect(res.status).toBe(404);
  });
});

describe("POST /auth/telegram", () => {
  it("503, если TELEGRAM_BOT_TOKEN не задан", async () => {
    const res = await fetch(`${BASE}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: "whatever" }),
    });
    expect(res.status).toBe(503);
  });

  it("валидная подпись → создаёт аккаунт с telegramId; повторный вход → тот же аккаунт", async () => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    const initData = buildInitData(telegramFields(777));

    const first = await fetch(`${BASE}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.telegramId).toBe("777");
    expect(firstBody.name).toBe("Alice");

    const second = await fetch(`${BASE}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const secondBody = await second.json();
    expect(secondBody.id).toBe(firstBody.id);
  });

  it("first_name и last_name → аккаунт с полным именем (инициалы аватара берут оба слова)", async () => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    const initData = buildInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 780, first_name: "Ербол", last_name: "Алибаев", username: "erbol" }),
    });

    const res = await fetch(`${BASE}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const body = await res.json();
    expect(body.name).toBe("Ербол Алибаев");
  });

  it("битая подпись → 401", async () => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    const initData = buildInitData(telegramFields(778)).replace(/hash=[0-9a-f]+/, "hash=deadbeef");

    const res = await fetch(`${BASE}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    expect(res.status).toBe(401);
  });

  it("устаревший auth_date → 401", async () => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    const staleAuthDate = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
    const initData = buildInitData(telegramFields(779, staleAuthDate));

    const res = await fetch(`${BASE}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    expect(res.status).toBe(401);
  });
});
