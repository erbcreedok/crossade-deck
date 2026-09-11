// ПРИВЯЗКА ТЕЛЕГРАМА ИЗ ОБЫЧНОГО БРАУЗЕРА — обратным потоком: страница показывает ссылку в бота,
// человек жмёт «Запустить», бот говорит серверу «это он», страница логинится сама.
//
// ПОЧЕМУ ИМЕННО ТАК, а не «введи номер — пришлём код»: бот не может написать первым и не может
// найти человека по номеру или @username — он знает только `chat_id` тех, кто сам ему написал.
// Прямой поток работал бы лишь для тех, кто когда-то поделился контактом, и заодно превращал бы
// бота в способ доставлять сообщения чужим людям.
//
// Код живёт в памяти процесса, как и коды приглашений (`inviteCodes.ts`): он одноразовый и
// пятиминутный, переживать перезапуск ему незачем.

import { randomBytes } from "crypto";

/** Сколько код живёт. Пять минут — успеть открыть телегу и нажать кнопку, и не больше. */
export const LINK_CODE_TTL_MS = 5 * 60 * 1000;
/** Не чаще одного кода в полминуты на аккаунт: иначе это бесплатный генератор ссылок в бота. */
export const LINK_CODE_EVERY_MS = 30 * 1000;
/** Сколько раз можно промахнуться кодом, прежде чем он сгорит. */
export const LINK_CODE_TRIES = 5;

/** Чем кончилось ожидание — ровно те же три исхода, что и у привязки из Mini App. */
export type LinkState = "waiting" | "linked" | "switch" | "conflict" | "expired";

export interface PendingLink {
  readonly code: string;
  /** Кого привязываем. */
  readonly accountId: string;
  readonly issuedAt: number;
  state: LinkState;
  /** Телеграм, который подтвердил бот. */
  telegramId?: string;
  tries: number;
}

const pending = new Map<string, PendingLink>();
const lastIssued = new Map<string, number>();

/**
 * КОД — СЛУЧАЙНЫЙ И НЕ ДЛЯ ЧТЕНИЯ ВСЛУХ: его подставляет ссылка, а не человек. Значит и городить
 * произносимый алфавит незачем — пусть будет шире и угадывается хуже.
 */
function newCode(): string {
  return randomBytes(12).toString("base64url");
}

function fresh(one: PendingLink, now: number): boolean {
  return now - one.issuedAt < LINK_CODE_TTL_MS;
}

/** Протухшие коды выметаются при каждом обращении: отдельный таймер ради этого не заводим. */
function sweep(now: number): void {
  for (const [code, one] of pending) if (!fresh(one, now)) pending.delete(code);
}

/** Слишком часто — это не ошибка ввода, это перебор. */
export function tooSoon(accountId: string, now = Date.now()): boolean {
  const last = lastIssued.get(accountId);
  return last !== undefined && now - last < LINK_CODE_EVERY_MS;
}

/** Выдать аккаунту новый код ожидания. Прежний его код перестаёт существовать. */
export function issueLinkCode(accountId: string, now = Date.now()): PendingLink {
  sweep(now);
  for (const [code, one] of pending) if (one.accountId === accountId) pending.delete(code);
  const one: PendingLink = { code: newCode(), accountId, issuedAt: now, state: "waiting", tries: 0 };
  pending.set(one.code, one);
  lastIssued.set(accountId, now);
  return one;
}

/** Код, если он ещё жив. Мёртвый стирается здесь же. */
export function linkByCode(code: string, now = Date.now()): PendingLink | undefined {
  const one = pending.get(code);
  if (!one) return undefined;
  if (!fresh(one, now)) {
    pending.delete(code);
    return undefined;
  }
  return one;
}

/**
 * БОТ ПОДТВЕРДИЛ, ЧЬЯ ЭТО ТЕЛЕГА. Что с этим делать — решает вызывающий (правило слияния живёт в
 * `accounts.ts`); здесь только записывается, чем ожидание кончилось.
 */
export function settleLink(code: string, telegramId: string, state: LinkState, now = Date.now()): PendingLink | undefined {
  const one = linkByCode(code, now);
  if (!one) return undefined;
  // ОДНОРАЗОВЫЙ: второй «Запустить» по той же ссылке ничего не привязывает заново.
  if (one.state !== "waiting") return undefined;
  one.state = state;
  one.telegramId = telegramId;
  return one;
}

/** Промах кодом. Пять промахов — и этот код больше не существует. */
export function missedLink(code: string, now = Date.now()): void {
  const one = pending.get(code);
  if (!one) return;
  one.tries += 1;
  if (one.tries >= LINK_CODE_TRIES || !fresh(one, now)) pending.delete(code);
}

/** ЗАБРАТЬ ИСХОД — и он уносится вместе с ответом: ожидание кончилось, код больше не нужен. */
export function takeSettled(code: string, now = Date.now()): PendingLink | undefined {
  const one = linkByCode(code, now);
  if (!one || one.state === "waiting") return one;
  pending.delete(code);
  return one;
}

/** Только для тестов: забыть все ожидания. */
export function forgetLinks(): void {
  pending.clear();
  lastIssued.clear();
}
