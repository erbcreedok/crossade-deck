// ТРИ ШАГА ОБРАТНОГО ПОТОКА, КАК ИХ ВИДИТ СЕТЬ: страница просит код, бот подтверждает, страница
// забирает исход.
//
// СТОРОЖ `telegram-link.only-our-bot-confirms`: подтверждение — это утверждение «вот этот chat_id
// принёс мне код», и принять его можно только от своего сервиса. Без секрета маршрут не работает
// вовсе, с чужим секретом — отвечает 401.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createApp } from "./app.js";
import { forgetLinks } from "./telegramLink.js";

vi.mock("fs", () => ({
  existsSync: () => false,
  readFileSync: () => "[]",
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const PORT = 2686;
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

const newAccount = async () => (await (await fetch(`${BASE}/accounts`, { method: "POST" })).json()) as {
  id: string;
  name: string;
  recoveryHash: string;
};

const codeFor = async (account: { id: string; recoveryHash: string }) =>
  (await (await post("/auth/telegram/link-code", { accountId: account.id, recoveryHash: account.recoveryHash })).json()) as {
    code: string;
    link: string;
  };

describe("POST /auth/telegram/link-code", () => {
  it("отдаёт ссылку в бота с кодом внутри", async () => {
    const account = await newAccount();
    const { code, link } = await codeFor(account);

    expect(link).toBe(`https://t.me/crossade_bot?start=${encodeURIComponent(code)}`);
  });

  it("чужим кодом восстановления код не выдаётся", async () => {
    const account = await newAccount();
    const res = await post("/auth/telegram/link-code", { accountId: account.id, recoveryHash: "WRONGC" });
    expect(res.status).toBe(403);
  });

  it("чаще раза в полминуты — 429, а не новая дверь", async () => {
    const account = await newAccount();
    await codeFor(account);
    const again = await post("/auth/telegram/link-code", { accountId: account.id, recoveryHash: account.recoveryHash });
    expect(again.status).toBe(429);
  });

  it("без настроенного бота маршрута нет вовсе", async () => {
    delete process.env.TELEGRAM_BOT_USERNAME;
    const account = await newAccount();
    const res = await post("/auth/telegram/link-code", { accountId: account.id, recoveryHash: account.recoveryHash });
    expect(res.status).toBe(503);
  });
});

describe("telegram-link.only-our-bot-confirms", () => {
  it("чужой секрет — 401, и ожидание остаётся ожиданием", async () => {
    const account = await newAccount();
    const { code } = await codeFor(account);

    const res = await post("/auth/telegram/claim", { code, telegramId: "tg-1", secret: "подобранный" });
    expect(res.status).toBe(401);

    const waiting = await (await fetch(`${BASE}/auth/telegram/link-code/${code}`)).json();
    expect(waiting.state).toBe("waiting");
  });

  it("без секрета на сервере подтверждать нечем", async () => {
    delete process.env.TELEGRAM_LINK_SECRET;
    const res = await post("/auth/telegram/claim", { code: "любой", telegramId: "tg-1", secret: "любой" });
    expect(res.status).toBe(503);
  });

  it("неизвестный код — 404", async () => {
    const res = await post("/auth/telegram/claim", { code: "никогда-не-выдавали", telegramId: "tg-1", secret: SECRET });
    expect(res.status).toBe(404);
  });
});

describe("весь путь целиком", () => {
  it("гость жмёт «Запустить» — телеграм привязан, страница получает свой аккаунт", async () => {
    const account = await newAccount();
    const { code } = await codeFor(account);

    const claim = await (await post("/auth/telegram/claim", { code, telegramId: "tg-100", secret: SECRET })).json();
    expect(claim.kind).toBe("linked");

    const settled = await (await fetch(`${BASE}/auth/telegram/link-code/${code}`)).json();
    expect(settled.state).toBe("linked");
    expect(settled.account.id).toBe(account.id);
    expect(settled.account.telegramId).toBe("tg-100");

    // Исход забирают один раз: код унесён вместе с ответом.
    const again = await (await fetch(`${BASE}/auth/telegram/link-code/${code}`)).json();
    expect(again.state).toBe("expired");
  });

  it("чистого гостя переключают на его настоящий аккаунт", async () => {
    const mine = await newAccount();
    const { code: first } = await codeFor(mine);
    await post("/auth/telegram/claim", { code: first, telegramId: "tg-200", secret: SECRET });

    const guest = await newAccount();
    const { code } = await codeFor(guest);
    await post("/auth/telegram/claim", { code, telegramId: "tg-200", secret: SECRET });

    const settled = await (await fetch(`${BASE}/auth/telegram/link-code/${code}`)).json();
    expect(settled.state).toBe("switch");
    // Страница становится ТЕМ аккаунтом — иначе переключать было бы нечем.
    expect(settled.account.id).toBe(mine.id);
    expect(settled.account.recoveryHash).toBe(mine.recoveryHash);
  });

  it("две полноценные стороны — conflict, и ничего не меняется", async () => {
    const first = await newAccount();
    const { code: one } = await codeFor(first);
    await post("/auth/telegram/claim", { code: one, telegramId: "tg-300", secret: SECRET });

    const second = await newAccount();
    const { code: two } = await codeFor(second);
    await post("/auth/telegram/claim", { code: two, telegramId: "tg-301", secret: SECRET });

    // Второй, уже со своей телегой, приносит чужую. Ожидания сбрасываются, потому что здесь
    // проверяется правило слияния, а не «не чаще раза в полминуты» — у того свой тест.
    forgetLinks();
    const { code: three } = await codeFor({ id: second.id, recoveryHash: second.recoveryHash });
    const claim = await (await post("/auth/telegram/claim", { code: three, telegramId: "tg-300", secret: SECRET })).json();
    expect(claim.kind).toBe("conflict");

    const settled = await (await fetch(`${BASE}/auth/telegram/link-code/${three}`)).json();
    expect(settled.state).toBe("conflict");

    const profile = await (await fetch(`${BASE}/accounts/${second.id}/profile`)).json();
    expect(profile.identities).toEqual(["telegram"]);
    const stillFirst = await (await fetch(`${BASE}/accounts/${first.id}/profile`)).json();
    expect(stillFirst.identities).toEqual(["telegram"]);
  });
});

// ПОВТОРНОЕ НАЖАТИЕ ТОЙ ЖЕ ССЫЛКИ — НЕ ПОЛОМКА. «Устарела» здесь читается как «всё сломалось» и
// отправляет человека делать заново то, что уже сделано.
describe("вторая попытка по той же ссылке", () => {
  it("код уже сработал — 409, а не 404", async () => {
    const account = await newAccount();
    const { code } = await codeFor(account);

    await post("/auth/telegram/claim", { code, telegramId: "tg-400", secret: SECRET });
    const again = await post("/auth/telegram/claim", { code, telegramId: "tg-400", secret: SECRET });

    expect(again.status).toBe(409);
    expect((await again.json()).kind).toBe("linked");
  });

  it("код, которого никогда не было, — по-прежнему 404", async () => {
    const res = await post("/auth/telegram/claim", { code: "такого-не-выдавали", telegramId: "tg-1", secret: SECRET });
    expect(res.status).toBe(404);
  });
});
