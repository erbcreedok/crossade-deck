// АККАУНТЫ — ДВЕРЬ ОСТАЛАСЬ ТА ЖЕ, КОМНАТА ЗА НЕЙ ДРУГАЯ.
//
// Снаружи это те же функции, что и во времена `accounts.json`: маршруты в `app.ts` и `KitRoom` не
// знают, что люди переехали в SQLite (`db/`). Внутри аккаунт — сущность, а способ входа — его
// идентичность: `telegramId` больше не поле, а строка в `identities`, и следующая дверь (google,
// passkey) не добавит сюда ни одного нового поля.
//
// `recoveryHash` остаётся тем, чем был: коротким кодом, которым человек доказывает, что аккаунт
// его. Новой схемы доверия здесь не заводится — есть работающая.

import { randomUUID, randomInt } from "crypto";
import {
  accountById,
  accountByIdentity,
  accountByRecoveryHash,
  identitiesOf,
  identityCount,
  insertAccount,
  linkIdentity,
  recoveryHashTaken,
  updateAccount,
  type AccountRow,
  type Identity,
  type Provider,
} from "./db/accountsRepo.js";
import { guestName } from "./guestNames.js";

/** Аккаунт, как его отдают наружу. `telegramId` выводится из идентичностей, а не хранится полем. */
export interface Account {
  id: string;
  name: string;
  recoveryHash: string;
  createdAt: number;
  telegramId?: string;
  color?: string;
  avatar?: string;
}

/** Профиль — те же поля плюс список дверей. Ключей от дверей (subject) наружу не отдаём. */
export interface Profile {
  id: string;
  name: string;
  createdAt: number;
  color: string | null;
  avatar: string | null;
  identities: readonly Provider[];
}

const MAX_NAME = 24;

function normalizeHash(hash: string): string {
  return hash.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Строка базы, одетая в то, чего ждёт остальной сервер. */
function dress(row: AccountRow): Account {
  const telegram = identitiesOf(row.id).find((one) => one.provider === "telegram");
  return {
    id: row.id,
    name: row.name,
    recoveryHash: row.recoveryHash,
    createdAt: row.createdAt,
    ...(telegram ? { telegramId: telegram.subject } : {}),
    ...(row.color ? { color: row.color } : {}),
    ...(row.avatar ? { avatar: row.avatar } : {}),
  };
}

// Короткий код вида "согласная-гласная-согласная-согласная-гласная-согласная"
// (напр. "BOVAKI") — короче hex-строки и легче произносится/вводится вручную.
const CONSONANTS = "BCDFGHJKLMNPRSTVWZ";
const VOWELS = "AEIOU";
const PATTERN = ["C", "V", "C", "C", "V", "C"] as const;

function generateRecoveryHash(): string {
  return PATTERN.map((kind) => {
    const set = kind === "C" ? CONSONANTS : VOWELS;
    return set[randomInt(set.length)];
  }).join("");
}

function freeRecoveryHash(): string {
  let hash = generateRecoveryHash();
  while (recoveryHashTaken(hash)) hash = generateRecoveryHash();
  return hash;
}

/**
 * Завести человека. Без имени он получает кличку от сервера («Золотой таракан»), а не номер: имя,
 * которое хочется сменить, — единственное, что просит назваться.
 */
export function createAccount(name?: string, telegramId?: string): Account {
  const id = randomUUID();
  const row = insertAccount({
    id,
    name: name?.trim().slice(0, MAX_NAME) || guestName(),
    color: null,
    avatar: null,
    createdAt: Date.now(),
    recoveryHash: freeRecoveryHash(),
  });
  if (telegramId) linkIdentity(id, "telegram", telegramId);
  return dress(row);
}

export function findAccountById(id: string): Account | undefined {
  const row = accountById(id);
  return row ? dress(row) : undefined;
}

export function findAccountByTelegramId(telegramId: string): Account | undefined {
  const row = accountByIdentity("telegram", telegramId);
  return row ? dress(row) : undefined;
}

export function findAccountByRecoveryHash(hash: string): Account | undefined {
  const row = accountByRecoveryHash(normalizeHash(hash));
  return row ? dress(row) : undefined;
}

/** Аккаунт, доказавший, что он свой. Одна проверка на все правки профиля. */
function mine(id: string, recoveryHash: string): AccountRow | undefined {
  const row = accountById(id);
  if (!row || row.recoveryHash !== normalizeHash(recoveryHash)) return undefined;
  return row;
}

export function renameAccount(id: string, recoveryHash: string, name: string): Account | undefined {
  return updateProfile(id, recoveryHash, { name });
}

/**
 * СМЕНИТЬ ИМЯ, ЦВЕТ ИЛИ АВАТАР. Пустое имя игнорируется (человек без имени за столом — это дыра);
 * пустой цвет и пустой аватар — это «снять», и они стираются.
 */
export function updateProfile(
  id: string,
  recoveryHash: string,
  patch: { name?: string; color?: string; avatar?: string },
): Account | undefined {
  const row = mine(id, recoveryHash);
  if (!row) return undefined;
  const next: { name?: string; color?: string | null; avatar?: string | null } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim().slice(0, MAX_NAME);
    if (trimmed) next.name = trimmed;
  }
  if (patch.color !== undefined) next.color = patch.color.trim() || null;
  if (patch.avatar !== undefined) next.avatar = patch.avatar.trim() || null;
  const updated = updateAccount(id, next);
  return updated ? dress(updated) : undefined;
}

export function regenerateRecoveryHash(id: string, recoveryHash: string): Account | undefined {
  const row = mine(id, recoveryHash);
  if (!row) return undefined;
  const updated = updateAccount(id, { recoveryHash: freeRecoveryHash() });
  return updated ? dress(updated) : undefined;
}

/** Профиль наружу: какие двери у человека есть, но не чем они отпираются. */
export function profileOf(id: string): Profile | undefined {
  const row = accountById(id);
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    color: row.color,
    avatar: row.avatar,
    identities: identitiesOf(row.id).map((one: Identity) => one.provider),
  };
}

/** Гость — это ноль дверей, и ничего больше. */
export function isGuest(id: string): boolean {
  return identityCount(id) === 0;
}

/**
 * ЧТО ВЫШЛО ИЗ ПОПЫТКИ ПРИВЯЗАТЬ ДВЕРЬ.
 *
 * `switch` — дверь уже ведёт к другому человеку, а тот, кто её предъявил, чистый гость: его никуда
 * не сливают, ему просто ОТДАЮТ его настоящий аккаунт, а гостевой остаётся в этом браузере.
 * `conflict` — обе стороны полноценные, и здесь мы не делаем ничего: слияние необратимо, а первая
 * же жалоба «куда делись предметы» будет неразрешима.
 */
export type LinkResult =
  | { kind: "linked"; account: Account }
  | { kind: "switch"; account: Account }
  | { kind: "conflict"; account: Account };

/**
 * ПРИВЯЗАТЬ ТЕЛЕГРАМ К СУЩЕСТВУЮЩЕМУ АККАУНТУ. Проверка подписи — та же, что у входа
 * (`telegramAuth.ts`); здесь уже известно, что `telegramId` настоящий.
 */
export function linkTelegram(id: string, recoveryHash: string, telegramId: string): LinkResult | undefined {
  const row = mine(id, recoveryHash);
  if (!row) return undefined;
  const owner = accountByIdentity("telegram", telegramId);
  if (owner) {
    if (owner.id === row.id) return { kind: "linked", account: dress(row) };
    // ДВЕ ПОЛНОЦЕННЫЕ СТОРОНЫ НЕ СЛИВАЮТСЯ НИКОГДА — их переключают.
    return isGuest(row.id)
      ? { kind: "switch", account: dress(owner) }
      : { kind: "conflict", account: dress(owner) };
  }
  linkIdentity(row.id, "telegram", telegramId);
  return { kind: "linked", account: dress(row) };
}

/** Имя, которым человека зовут за столом. Для ростера, которому чужие поля ни к чему. */
export function accountName(id: string): string | undefined {
  return accountById(id)?.name;
}
