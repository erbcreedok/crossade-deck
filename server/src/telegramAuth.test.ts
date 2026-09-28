import { describe, it, expect } from "vitest";
import { createHash, createHmac } from "crypto";
import { verifyTelegramInitData, verifyTelegramLogin } from "./telegramAuth.js";

const BOT_TOKEN = "test-bot-token";

function buildInitData(fields: Record<string, string>, botToken = BOT_TOKEN): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

function fieldsFor(authDate: number) {
  return {
    auth_date: String(authDate),
    query_id: "AAH_query",
    user: JSON.stringify({ id: 12345, first_name: "Alice", username: "alice_tg" }),
  };
}

describe("verifyTelegramInitData", () => {
  it("accepts a validly signed, fresh initData", () => {
    const now = 1_700_000_000_000;
    const initData = buildInitData(fieldsFor(Math.floor(now / 1000)));

    const user = verifyTelegramInitData(initData, BOT_TOKEN, now);

    expect(user).toEqual({ id: 12345, first_name: "Alice", last_name: undefined, username: "alice_tg" });
  });

  it("passes through last_name when Telegram sends it", () => {
    const now = 1_700_000_000_000;
    const initData = buildInitData({
      auth_date: String(Math.floor(now / 1000)),
      query_id: "AAH_query",
      user: JSON.stringify({ id: 12345, first_name: "Ербол", last_name: "Алибаев", username: "erbol" }),
    });

    const user = verifyTelegramInitData(initData, BOT_TOKEN, now);

    expect(user?.last_name).toBe("Алибаев");
  });

  it("rejects a tampered signature", () => {
    const now = 1_700_000_000_000;
    const initData = buildInitData(fieldsFor(Math.floor(now / 1000))).replace(/hash=[0-9a-f]+/, "hash=deadbeef");

    expect(verifyTelegramInitData(initData, BOT_TOKEN, now)).toBeNull();
  });

  it("rejects an initData signed for a different bot token", () => {
    const now = 1_700_000_000_000;
    const initData = buildInitData(fieldsFor(Math.floor(now / 1000)), "other-token");

    expect(verifyTelegramInitData(initData, BOT_TOKEN, now)).toBeNull();
  });

  it("rejects an auth_date older than 24h", () => {
    const now = 1_700_000_000_000;
    const staleAuthDate = Math.floor((now - 25 * 60 * 60 * 1000) / 1000);
    const initData = buildInitData(fieldsFor(staleAuthDate));

    expect(verifyTelegramInitData(initData, BOT_TOKEN, now)).toBeNull();
  });

  it("rejects initData without a hash", () => {
    const params = new URLSearchParams(fieldsFor(1_700_000_000));
    expect(verifyTelegramInitData(params.toString(), BOT_TOKEN)).toBeNull();
  });
});

describe("telegram-login.widget-signature", () => {
  const sign = (fields: Record<string, string | number>, token = BOT_TOKEN) => {
    const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
    return { ...fields, hash: createHmac("sha256", createHash("sha256").update(token).digest()).update(check).digest("hex") };
  };
  const now = Date.UTC(2026, 8, 28);
  const me = { id: 42, first_name: "Ербол", username: "erbol", auth_date: Math.floor(now / 1000) - 60 };

  it("своя подпись — человек тот же, что в Mini App (номер Telegram)", () => {
    expect(verifyTelegramLogin(sign(me), BOT_TOKEN, now)).toMatchObject({ id: 42, first_name: "Ербол", username: "erbol" });
  });

  it("подпись Mini App (HMAC WebAppData) за подпись входа не сходит, и чужой токен тоже", () => {
    expect(verifyTelegramLogin(sign(me, "чужой-токен"), BOT_TOKEN, now)).toBeNull();
    const check = Object.keys(me).sort().map((k) => `${k}=${(me as Record<string, unknown>)[k]}`).join("\n");
    const webApp = createHmac("sha256", createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest()).update(check).digest("hex");
    expect(verifyTelegramLogin({ ...me, hash: webApp }, BOT_TOKEN, now)).toBeNull();
  });

  it("подменённый номер или протухший вход — нет", () => {
    expect(verifyTelegramLogin({ ...sign(me), id: 43 }, BOT_TOKEN, now)).toBeNull();
    expect(verifyTelegramLogin(sign({ ...me, auth_date: Math.floor(now / 1000) - 2 * 86400 }), BOT_TOKEN, now)).toBeNull();
  });
});
