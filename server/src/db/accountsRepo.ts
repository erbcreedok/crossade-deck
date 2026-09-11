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
  /** Как его зовут ТАМ и его тамошнее лицо — то, что дверь может предложить взять сюда. */
  readonly offeredName: string | null;
  readonly offeredPhoto: string | null;
  /** От чего человек уже отказался: «оставить своё» — решение, а не пропуск вопроса. */
  readonly declinedName: boolean;
  readonly declinedPhoto: boolean;
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
  patch: { name?: string; color?: string | null; avatar?: string | null; recoveryHash?: string; nameChosen?: boolean },
  at: DatabaseSync = db(),
): AccountRow | undefined {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  // НАЗВАЛСЯ — ЗНАЧИТ НАЗВАЛСЯ: имя, пришедшее правкой профиля, всегда его собственное.
  if (patch.name !== undefined) (sets.push("name = ?", "name_chosen = 1"), values.push(patch.name));
  if (patch.color !== undefined) (sets.push("color = ?"), values.push(patch.color));
  if (patch.avatar !== undefined) (sets.push("avatar = ?"), values.push(patch.avatar));
  if (patch.recoveryHash !== undefined) (sets.push("recovery_hash = ?"), values.push(patch.recoveryHash));
  // Имя, ВЗЯТОЕ ИЗ ТЕЛЕГИ, тоже своё: человек его не выбирал из списка, но и кличкой оно больше не
  // является — предлагать ему «назваться» после этого значит не замечать, что он уже назван.
  if (patch.nameChosen !== undefined) (sets.push("name_chosen = ?"), values.push(patch.nameChosen ? 1 : 0));
  if (sets.length > 0) at.prepare(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  return accountById(id, at);
}

export function identitiesOf(accountId: string, at: DatabaseSync = db()): readonly Identity[] {
  const rows = at
    .prepare(
      `SELECT provider, subject, label, offered_name, offered_photo, declined_name, declined_photo, verified_at
       FROM identities WHERE account_id = ? ORDER BY verified_at`,
    )
    .all(accountId) as {
    provider: Provider;
    subject: string;
    label: string | null;
    offered_name: string | null;
    offered_photo: string | null;
    declined_name: number;
    declined_photo: number;
    verified_at: number;
  }[];
  return rows.map((r) => ({
    provider: r.provider,
    subject: r.subject,
    label: r.label,
    offeredName: r.offered_name,
    offeredPhoto: r.offered_photo,
    declinedName: r.declined_name === 1,
    declinedPhoto: r.declined_photo === 1,
    verifiedAt: r.verified_at,
  }));
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
/** Что дверь знает о человеке на той стороне. */
export interface DoorFace {
  readonly label?: string | null;
  /** Как его зовут там — «Ербол Сыздык». */
  readonly name?: string | null;
  /** Его тамошнее лицо: ссылка или ключ файла, по которому лицо можно получить. */
  readonly photo?: string | null;
}

export function linkIdentity(
  accountId: string,
  provider: Provider,
  subject: string,
  face: DoorFace = {},
  at: DatabaseSync = db(),
): Identity {
  const verifiedAt = Date.now();
  const label = face.label ?? null;
  const offeredName = face.name ?? null;
  const offeredPhoto = face.photo ?? null;
  at.prepare(
    `INSERT INTO identities (provider, subject, account_id, label, offered_name, offered_photo, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(provider, subject, accountId, label, offeredName, offeredPhoto, verifiedAt);
  return { provider, subject, label, offeredName, offeredPhoto, declinedName: false, declinedPhoto: false, verifiedAt };
}

/** ЧЕЛОВЕК СКАЗАЛ «ОСТАВИТЬ СВОЁ». Дверь это помнит и больше про это не спрашивает. */
export function declineOffer(
  accountId: string,
  provider: Provider,
  what: "name" | "photo",
  at: DatabaseSync = db(),
): void {
  const column = what === "name" ? "declined_name" : "declined_photo";
  at.prepare(`UPDATE identities SET ${column} = 1 WHERE account_id = ? AND provider = ?`).run(accountId, provider);
}

/**
 * ДВЕРЬ ПЕРЕСПРАШИВАЕТ, ЧТО ЗА НЕЙ. Человек сменил в телеге имя или лицо — и, придя снова, должен
 * увидеть предложение с НОВЫМ, а не с тем, что мы записали в первый раз.
 *
 * ОТКАЗ СНИМАЕТСЯ ВМЕСТЕ СО СМЕНОЙ: «оставить своё» было сказано про старое лицо, и молчать про
 * новое на этом основании — значит никогда его не предложить.
 */
export function refreshIdentity(
  accountId: string,
  provider: Provider,
  face: DoorFace,
  at: DatabaseSync = db(),
): void {
  const before = identitiesOf(accountId, at).find((one) => one.provider === provider);
  if (!before) return;
  const label = face.label ?? before.label;
  const name = face.name ?? null;
  const photo = face.photo ?? null;
  at.prepare(
    `UPDATE identities
        SET label = ?, offered_name = ?, offered_photo = ?,
            declined_name = CASE WHEN ? THEN 0 ELSE declined_name END,
            declined_photo = CASE WHEN ? THEN 0 ELSE declined_photo END
      WHERE account_id = ? AND provider = ?`,
  ).run(
    label,
    name,
    photo,
    name !== null && name !== before.offeredName ? 1 : 0,
    photo !== null && photo !== before.offeredPhoto ? 1 : 0,
    accountId,
    provider,
  );
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
