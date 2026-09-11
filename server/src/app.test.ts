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

describe("GET /accounts/:id/profile", () => {
  it("отдаёт поля профиля и список дверей, но не ключи от них", async () => {
    const created = await (await fetch(`${BASE}/accounts`, { method: "POST" })).json();

    const res = await fetch(`${BASE}/accounts/${created.id}/profile`);
    const profile = await res.json();

    expect(res.status).toBe(200);
    expect(profile.id).toBe(created.id);
    expect(profile.name).toBe(created.name);
    expect(profile.identities).toEqual([]);
    expect(typeof profile.createdAt).toBe("number");
    expect(profile.color).toBeNull();
    expect(JSON.stringify(profile)).not.toContain(created.recoveryHash);
  });

  it("404 на неизвестный аккаунт", async () => {
    const res = await fetch(`${BASE}/accounts/does-not-exist/profile`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /accounts/:id", () => {
  const patch = (id: string, body: Record<string, unknown>) =>
    fetch(`${BASE}/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("меняет имя, цвет и аватар своим кодом", async () => {
    const account = await (await fetch(`${BASE}/accounts`, { method: "POST" })).json();

    const res = await patch(account.id, {
      recoveryHash: account.recoveryHash,
      name: "Ербол",
      color: "#f2c14e",
      avatar: "🐙",
    });
    const updated = await res.json();

    expect(res.status).toBe(200);
    expect(updated.name).toBe("Ербол");
    expect(updated.color).toBe("#f2c14e");
    expect(updated.avatar).toBe("🐙");
  });

  it("403 на чужой код, и профиль не тронут", async () => {
    const account = await (await fetch(`${BASE}/accounts`, { method: "POST" })).json();

    const res = await patch(account.id, { recoveryHash: "WRONGC", name: "Взломщик" });

    expect(res.status).toBe(403);
    const profile = await (await fetch(`${BASE}/accounts/${account.id}/profile`)).json();
    expect(profile.name).toBe(account.name);
  });

  it("400, когда менять нечего", async () => {
    const account = await (await fetch(`${BASE}/accounts`, { method: "POST" })).json();
    expect((await patch(account.id, { recoveryHash: account.recoveryHash })).status).toBe(400);
  });
});

describe("POST /accounts/:id/identities/telegram", () => {
  const link = (id: string, body: Record<string, unknown>) =>
    fetch(`${BASE}/accounts/${id}/identities/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const signed = (tgId: string) =>
    buildInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: Number(tgId), first_name: "Tg" }),
    });

  it("503 без TELEGRAM_BOT_TOKEN", async () => {
    const res = await link("whoever", { initData: "x", recoveryHash: "y" });
    expect(res.status).toBe(503);
  });

  it("свободная дверь привязывается к своему аккаунту", async () => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    const account = await (await fetch(`${BASE}/accounts`, { method: "POST" })).json();

    const res = await link(account.id, { initData: signed("7001"), recoveryHash: account.recoveryHash });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.kind).toBe("linked");
    expect(body.account.telegramId).toBe("7001");
    const profile = await (await fetch(`${BASE}/accounts/${account.id}/profile`)).json();
    expect(profile.identities.map((one: { provider: string }) => one.provider)).toEqual(["telegram"]);
  });

  it("чистого гостя переключают на его настоящий аккаунт, а не сливают", async () => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    const real = await (await fetch(`${BASE}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: signed("7002") }),
    })).json();
    const guest = await (await fetch(`${BASE}/accounts`, { method: "POST" })).json();

    const res = await link(guest.id, { initData: signed("7002"), recoveryHash: guest.recoveryHash });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.kind).toBe("switch");
    expect(body.account.id).toBe(real.id);
    // Гостевой аккаунт остался там, где был.
    const guestProfile = await (await fetch(`${BASE}/accounts/${guest.id}/profile`)).json();
    expect(guestProfile.identities).toEqual([]);
  });

  it("409, когда обе стороны полноценные, и в базе ничего не меняется", async () => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    const mine = await (await fetch(`${BASE}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: signed("7003") }),
    })).json();
    const other = await (await fetch(`${BASE}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: signed("7004") }),
    })).json();

    const res = await link(mine.id, { initData: signed("7004"), recoveryHash: mine.recoveryHash });

    expect(res.status).toBe(409);
    expect((await res.json()).account.id).toBe(other.id);
    const profile = await (await fetch(`${BASE}/accounts/${mine.id}/profile`)).json();
    expect(profile.identities.map((one: { provider: string }) => one.provider)).toEqual(["telegram"]);
  });

  it("битая подпись → 401", async () => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    const account = await (await fetch(`${BASE}/accounts`, { method: "POST" })).json();
    const bad = buildInitData(
      { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 7005, first_name: "X" }) },
      "not-the-bot-token",
    );
    expect((await link(account.id, { initData: bad, recoveryHash: account.recoveryHash })).status).toBe(401);
  });
});
