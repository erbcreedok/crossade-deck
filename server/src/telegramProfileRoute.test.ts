// СТОРОЖ `telegram-profile.the-bot-edits-through-the-door-not-the-code`.
//
// Разговор про имя и лицо идёт в телеге, значит правки приходят оттуда. Но кода восстановления у
// бота нет и быть не должно: он ведёт разговор, а не владеет аккаунтом. Доказательств два и оба
// чужие для него по отдельности — общий секрет (это наш бот) и дверь (телега подписала, кто пришёл).

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createApp } from "./app.js";
import { forgetLinks } from "./telegramLink.js";

vi.mock("fs", () => ({
  existsSync: () => false,
  readFileSync: () => "[]",
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const PORT = 2687;
const BASE = `http://localhost:${PORT}`;
const SECRET = "bot-and-server-know-this";

let httpServer: ReturnType<typeof createApp>["httpServer"];

beforeAll(async () => {
  ({ httpServer } = createApp());
  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

beforeEach(() => {
  forgetLinks();
  process.env.TELEGRAM_BOT_USERNAME = "crossade_bot";
  process.env.TELEGRAM_LINK_SECRET = SECRET;
});

const post = (path: string, body: unknown) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Человек со своим именем, за которым уже закреплена дверь телеги. */
async function linked(telegramId: string, offeredName = "Ербол Сыздык") {
  const account = (await (await fetch(`${BASE}/accounts`, { method: "POST" })).json()) as {
    id: string;
    recoveryHash: string;
  };
  await fetch(`${BASE}/accounts/${account.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recoveryHash: account.recoveryHash, name: "Драный олень" }),
  });
  const { code } = (await (await post("/auth/telegram/link-code", {
    accountId: account.id,
    recoveryHash: account.recoveryHash,
  })).json()) as { code: string };
  await post("/auth/telegram/claim", { code, telegramId, secret: SECRET, offeredName });
  return account;
}

describe("telegram-profile.the-bot-edits-through-the-door-not-the-code", () => {
  it("наш бот меняет имя по двери, без кода восстановления", async () => {
    const account = await linked("90001");

    const res = await post("/auth/telegram/profile", { telegramId: "90001", secret: SECRET, name: "Ербол Сыздык" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe("Ербол Сыздык");
    const profile = await (await fetch(`${BASE}/accounts/${account.id}/profile`)).json();
    expect(profile.name).toBe("Ербол Сыздык");
  });

  it("чужой секрет — 401, и в профиле ничего не меняется", async () => {
    const account = await linked("90002");

    const res = await post("/auth/telegram/profile", { telegramId: "90002", secret: "подобранный", name: "Взломщик" });

    expect(res.status).toBe(401);
    const profile = await (await fetch(`${BASE}/accounts/${account.id}/profile`)).json();
    expect(profile.name).toBe("Драный олень");
  });

  it("дверь, за которой никого нет, — 404", async () => {
    const res = await post("/auth/telegram/profile", { telegramId: "нет-такого", secret: SECRET, name: "Никто" });
    expect(res.status).toBe(404);
  });

  it("«оставить своё» приходит из телеги и гасит вопрос и на странице тоже", async () => {
    const account = await linked("90003");

    const res = await post("/auth/telegram/profile", { telegramId: "90003", secret: SECRET, keep: "name" });
    const body = await res.json();

    expect(res.status).toBe(200);
    // Ответ сразу говорит, о чём спрашивать дальше — разговор идёт в одну сторону.
    expect(body.offer.kind).not.toBe("name");
    const onPage = await (await fetch(`${BASE}/accounts/${account.id}/telegram-offer`)).json();
    expect(onPage.kind).not.toBe("name");
  });

  it("пустая правка — 400, а не молчаливое «ок»", async () => {
    await linked("90004");
    const res = await post("/auth/telegram/profile", { telegramId: "90004", secret: SECRET });
    expect(res.status).toBe(400);
  });
});
