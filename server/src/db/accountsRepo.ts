// АККАУНТ И ЕГО ДВЕРИ, КАК СТРОКИ В БАЗЕ. Единственное место, где пишется SQL про людей.
//
// Аккаунт — сущность; способ входа — его идентичность (`identity(provider, subject)`), и их у
// аккаунта сколько угодно. Гость — не «без аккаунта», а аккаунт с нулём идентичностей: статистика,
// цвет и предметы копятся с первого касания, а «регистрация» — привязка двери к уже существующему
// тебе, а не рождение с нуля.

import type { DatabaseSync } from "node:sqlite";
import { db } from "./open.js";

/** Двери, которые схема допускает. Список закрытый: опечатка в провайдере — потерянный человек. */
export const PROVIDERS = ["telegram", "google", "apple", "passkey", "guest"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface Identity {
  readonly provider: Provider;
  readonly subject: string;
  /** Как человека зовут за этой дверью — `@erbol`. Подпись для экрана, не ключ. */
  readonly label: string | null;
  readonly verifiedAt: number;
}

/** Аккаунт, как его держит база. `telegramId` НЕ поле — он выводится из идентичностей. */
export interface AccountRow {
  readonly id: string;
  readonly name: string;
  /** Назвался ли человек сам. Ложь — на нём кличка, выданная столом. */
  readonly nameChosen: boolean;
  readonly color: string | null;
  readonly avatar: string | null;
  readonly createdAt: number;
  readonly recoveryHash: string;
}

interface RawAccount {
  id: string;
  name: string;
  name_chosen: number;
  color: string | null;
  avatar: string | null;
  created_at: number;
  recovery_hash: string;
}

function toAccount(raw: RawAccount | undefined): AccountRow | undefined {
  if (!raw) return undefined;
  return {
    id: raw.id,
    name: raw.name,
    nameChosen: raw.name_chosen === 1,
    color: raw.color,
    avatar: raw.avatar,
    createdAt: raw.created_at,
    recoveryHash: raw.recovery_hash,
  };
}

const SELECT = `SELECT id, name, name_chosen, color, avatar, created_at, recovery_hash FROM accounts`;

export function insertAccount(row: AccountRow, at: DatabaseSync = db()): AccountRow {
  at.prepare(
    `INSERT INTO accounts (id, name, name_chosen, color, avatar, created_at, recovery_hash) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.name, row.nameChosen ? 1 : 0, row.color, row.avatar, row.createdAt, row.recoveryHash);
  return row;
}

export function accountById(id: string, at: DatabaseSync = db()): AccountRow | undefined {
  return toAccount(at.prepare(`${SELECT} WHERE id = ?`).get(id) as RawAccount | undefined);
}

export function accountByRecoveryHash(hash: string, at: DatabaseSync = db()): AccountRow | undefined {
  return toAccount(at.prepare(`${SELECT} WHERE recovery_hash = ?`).get(hash) as RawAccount | undefined);
}

export function recoveryHashTaken(hash: string, at: DatabaseSync = db()): boolean {
  return at.prepare(`SELECT 1 FROM accounts WHERE recovery_hash = ?`).get(hash) !== undefined;
}

/** Сменить любое из полей профиля. `undefined` — не трогать, и это не то же, что «очистить». */
export function updateAccount(
  id: string,
  patch: { name?: string; color?: string | null; avatar?: string | null; recoveryHash?: string },
  at: DatabaseSync = db(),
): AccountRow | undefined {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  // НАЗВАЛСЯ — ЗНАЧИТ НАЗВАЛСЯ: имя, пришедшее правкой профиля, всегда его собственное.
  if (patch.name !== undefined) (sets.push("name = ?", "name_chosen = 1"), values.push(patch.name));
  if (patch.color !== undefined) (sets.push("color = ?"), values.push(patch.color));
  if (patch.avatar !== undefined) (sets.push("avatar = ?"), values.push(patch.avatar));
  if (patch.recoveryHash !== undefined) (sets.push("recovery_hash = ?"), values.push(patch.recoveryHash));
  if (sets.length > 0) at.prepare(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  return accountById(id, at);
}

export function identitiesOf(accountId: string, at: DatabaseSync = db()): readonly Identity[] {
  const rows = at
    .prepare(`SELECT provider, subject, label, verified_at FROM identities WHERE account_id = ? ORDER BY verified_at`)
    .all(accountId) as { provider: Provider; subject: string; label: string | null; verified_at: number }[];
  return rows.map((r) => ({ provider: r.provider, subject: r.subject, label: r.label, verifiedAt: r.verified_at }));
}

export function accountByIdentity(
  provider: Provider,
  subject: string,
  at: DatabaseSync = db(),
): AccountRow | undefined {
  const row = at
    .prepare(`SELECT account_id FROM identities WHERE provider = ? AND subject = ?`)
    .get(provider, subject) as { account_id: string } | undefined;
  return row ? accountById(row.account_id, at) : undefined;
}

/**
 * ПРИВЯЗАТЬ ДВЕРЬ. Одна и та же дверь не может вести к двум людям — за этим следит первичный ключ
 * `(provider, subject)`, а не проверка перед вставкой: проверка и вставка это два шага, а ключ один.
 */
export function linkIdentity(
  accountId: string,
  provider: Provider,
  subject: string,
  label: string | null = null,
  at: DatabaseSync = db(),
): Identity {
  const verifiedAt = Date.now();
  at.prepare(
    `INSERT INTO identities (provider, subject, account_id, label, verified_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(provider, subject, accountId, label, verifiedAt);
  return { provider, subject, label, verifiedAt };
}

/**
 * ОТВЯЗАТЬ ДВЕРЬ. Аккаунт от этого не исчезает и не становится «неполноценным»: рядом остаётся код
 * восстановления, и потеря телеги не должна уносить с собой предметы, статистику и друзей.
 */
export function unlinkIdentity(accountId: string, provider: Provider, at: DatabaseSync = db()): boolean {
  const done = at
    .prepare(`DELETE FROM identities WHERE account_id = ? AND provider = ?`)
    .run(accountId, provider);
  return Number(done.changes) > 0;
}

/** Сколько дверей у аккаунта. Ноль — это и есть гость, и это единственное определение гостя. */
export function identityCount(accountId: string, at: DatabaseSync = db()): number {
  const row = at.prepare(`SELECT COUNT(*) AS n FROM identities WHERE account_id = ?`).get(accountId) as {
    n: number;
  };
  return row.n;
}
