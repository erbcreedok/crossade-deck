// НАСТРОЙКИ СТОЛА — из окружения, и читаются в момент вопроса, а не при загрузке модуля: тест
// выставляет переменную и сразу получает её, не перезагружая сервер.
//
//   TELEGRAM_BOT_TOKEN   проверка подписи Mini App
//   TABLE_SECRET         общий с ботом секрет: подпись id комнат и управление ими по HTTP
//   TABLE_GUESTS=1       пускать без Telegram (браузер разработчика)
//   TABLE_PUBLIC_URL     где этот сервер виден снаружи — его маяк несёт реле
//   TABLE_RELAY_URL      куда слать маяк (сервер на Fly)
//   TABLE_TURN_URL       ретранслятор голоса (`turn:host:3478`), через запятую — несколько
//   TABLE_TURN_USER      имя и пароль к нему
//   TABLE_TURN_PASS

import type { IceServer } from "./contract.js";

export const tableConfig = () => ({
  botToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
  secret: process.env.TABLE_SECRET || undefined,
  guests: process.env.TABLE_GUESTS === "1",
  publicUrl: process.env.TABLE_PUBLIC_URL || undefined,
  relayUrl: process.env.TABLE_RELAY_URL || undefined,
  turn: turnOf(),
});

/**
 * ЧЕРЕЗ ЧТО ГОЛОСАМ ИСКАТЬ ДРУГ ДРУГА.
 *
 * STUN только подсказывает устройству его внешний адрес: двое за NAT, который не пускает чужие
 * пакеты, друг до друга так и не дозвонятся, даже когда с третьим у каждого всё хорошо. Для них
 * нужен РЕТРАНСЛЯТОР (TURN) — он пропускает речь через себя. Не задан — остаётся один STUN, и такая
 * пара останется без связи.
 */
export function turnOf(): IceServer[] {
  const urls = (process.env.TABLE_TURN_URL || "").split(",").map((one) => one.trim()).filter(Boolean);
  if (urls.length === 0) return [];
  const user = process.env.TABLE_TURN_USER || undefined;
  const pass = process.env.TABLE_TURN_PASS || undefined;
  return [{ urls, ...(user ? { username: user } : {}), ...(pass ? { credential: pass } : {}) }];
}

/** Публичные STUN: они бесплатны и нужны всем, поэтому записаны здесь, а не в настройках запуска. */
export const STUN: IceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

export const iceServers = (): IceServer[] => [...STUN, ...turnOf()];
