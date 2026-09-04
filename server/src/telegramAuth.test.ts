import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyTelegramInitData } from "./telegramAuth.js";

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

    expect(user).toEqual({ id: 12345, first_name: "Alice", username: "alice_tg" });
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
