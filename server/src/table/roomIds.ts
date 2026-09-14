// ИМЯ КОМНАТЫ — ПОДПИСАННОЕ, А НЕ ЗАПИСАННОЕ.
//
// У комнаты стола нет кода: её имя — случайная часть и подпись общим секретом бота и сервера. Бот
// может выписать имя, НЕ спрашивая сервер (inline-карточку в чужой личке он собирает, пока сервер,
// может быть, спит), а сервер откроет комнату по первому входу, только если подпись сошлась. Имя
// с чужой подписью комнату не открывает: подобрать id — не значит завести стол.
//
// Длина и алфавит — под `startapp` Telegram: до 64 символов, `A-Za-z0-9_-`.

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const SIG = 12;

const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url").slice(0, SIG);

export function mintRoom(secret: string): string {
  const body = randomBytes(8).toString("base64url");
  return `${body}${sign(body, secret)}`;
}

export function roomIsSigned(room: unknown, secret: string): room is string {
  if (typeof room !== "string" || !/^[A-Za-z0-9_-]{12,64}$/.test(room)) return false;
  const body = room.slice(0, -SIG);
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(room.slice(-SIG));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
