import { createHmac, timingSafeEqual } from "crypto";

export interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

// Telegram Mini Apps: подпись initData не старше суток защищает от replay старой ссылки.
const MAX_AUTH_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Проверка initData Telegram Mini App по алгоритму из документации:
 * secret = HMAC_SHA256("WebAppData", botToken), hash = HMAC_SHA256(secret, data_check_string).
 * Возвращает распознанного пользователя или null на любую неудачу (битая подпись,
 * просроченный auth_date, нечитаемое поле user).
 */
export function verifyTelegramInitData(initData: string, botToken: string, now = Date.now()): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const expected = Buffer.from(computedHash, "hex");
  const actual = Buffer.from(hash, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || now - authDate * 1000 > MAX_AUTH_AGE_MS) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  try {
    const user = JSON.parse(userRaw);
    if (typeof user?.id !== "number") return null;
    return { id: user.id, first_name: user.first_name, username: user.username };
  } catch {
    return null;
  }
}
