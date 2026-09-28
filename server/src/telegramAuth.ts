import { createHash, createHmac, timingSafeEqual } from "crypto";

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
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
    return { id: user.id, first_name: user.first_name, last_name: user.last_name, username: user.username, photo_url: user.photo_url };
  } catch {
    return null;
  }
}

/**
 * ВХОД ЧЕРЕЗ TELEGRAM НА САЙТЕ (Login Widget) — не Mini App, а кнопка «Войти через Telegram»: поля человека
 * приходят как есть, подпись — по ключу SHA256(токен бота), а не HMAC("WebAppData"). Так входит приложение
 * Crossade, у которого своего Telegram нет.
 */
export function verifyTelegramLogin(fields: Record<string, unknown>, botToken: string, now = Date.now()): TelegramUser | null {
  const hash = typeof fields.hash === "string" ? fields.hash : "";
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  const pairs = Object.entries(fields)
    .filter(([key, value]) => key !== "hash" && value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = pairs.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const expected = Buffer.from(createHmac("sha256", secretKey).update(dataCheckString).digest("hex"), "hex");
  const actual = Buffer.from(hash, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const authDate = Number(fields.auth_date);
  if (!authDate || now - authDate * 1000 > MAX_AUTH_AGE_MS) return null;
  const id = Number(fields.id);
  if (!Number.isSafeInteger(id)) return null;
  const text = (key: string) => (typeof fields[key] === "string" ? (fields[key] as string) : undefined);
  return { id, first_name: text("first_name"), last_name: text("last_name"), username: text("username"), photo_url: text("photo_url") };
}
