// Аккаунт игрока: свои учётки без Firebase (см. server/src/accounts.ts). Хранилище и HTTP-слой
// оба принимают свои зависимости параметром (Storage-подобный объект, fetch), чтобы юниты шли
// без jsdom и без сети — только подставные объекты. Форма перенесена из client/src/account.ts,
// код свой (client2 не тянет React в net/).

import { httpUrl } from "./runtimeConfig";

export interface StoredAccount {
  id: string;
  name: string;
  recoveryCode: string;
}

// Минимальный интерфейс localStorage — ровно то, чем мы пользуемся, чтобы тест мог подсунуть
// простой Map-обёртку вместо настоящего Storage.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const ACCOUNT_STORAGE_KEY = "crossade-deck:account";

function isStoredAccount(value: unknown): value is StoredAccount {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.name === "string" && typeof v.recoveryCode === "string";
}

export function loadAccount(storage: StorageLike): StoredAccount | null {
  const raw = storage.getItem(ACCOUNT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isStoredAccount(parsed) ? parsed : null;
  } catch {
    // повреждённая запись — читается как «аккаунта нет», а не как ошибка приложения
    return null;
  }
}

export function saveAccount(storage: StorageLike, account: StoredAccount): void {
  storage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
}

export function clearAccount(storage: StorageLike): void {
  storage.removeItem(ACCOUNT_STORAGE_KEY);
}

// Обёртка над настоящим localStorage — единственное место, которое трогает браузерный глобал.
// Юниты идут поверх loadAccount/saveAccount/clearAccount с подставным StorageLike и эту функцию
// не вызывают.
export function browserAccountStorage(): StorageLike {
  return window.localStorage;
}

// Как server/src/accounts.ts::normalizeHash — код восстановления сравнивается без учёта
// разделителей и регистра ("bova-ki" и "BOVAKI" — один и тот же код).
export function normalizeCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

// Тело ответа сервера — поле называется recoveryHash (см. server/src/accounts.ts). В нашем типе
// оно называется recoveryCode: это код, который игрок ВВОДИТ, а не хэш в криптографическом
// смысле, и общее с сервером имя только путало бы.
interface AccountApiResponse {
  id: string;
  name: string;
  recoveryHash: string;
}

function fromApiResponse(res: AccountApiResponse): StoredAccount {
  return { id: res.id, name: res.name, recoveryCode: res.recoveryHash };
}

export type FetchLike = typeof fetch;

/**
 * Потолок ожидания HTTP-ручек аккаунта.
 *
 * Без него неотвечающий адрес (сервер за выключенным VPN, LAN-IP из чужой сети) держал запрос
 * системные ~100 секунд, и лобби всё это время выглядело просто зависшим: ошибка появлялась
 * тогда, когда её уже никто не ждал.
 */
const ACCOUNT_TIMEOUT_MS = 8000;

async function readJsonOrThrow(res: Response, failure: string): Promise<AccountApiResponse> {
  if (!res.ok) throw new Error(failure);
  return (await res.json()) as AccountApiResponse;
}

export async function createAccount(
  name: string | undefined,
  fetchImpl: FetchLike = fetch
): Promise<StoredAccount> {
  const res = await fetchImpl(`${httpUrl()}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(ACCOUNT_TIMEOUT_MS),
  });
  return fromApiResponse(await readJsonOrThrow(res, "account_create_failed"));
}

export async function restoreAccount(
  code: string,
  fetchImpl: FetchLike = fetch
): Promise<StoredAccount> {
  const res = await fetchImpl(`${httpUrl()}/accounts/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recoveryHash: normalizeCode(code) }),
    signal: AbortSignal.timeout(ACCOUNT_TIMEOUT_MS),
  });
  return fromApiResponse(await readJsonOrThrow(res, "account_not_found"));
}

export async function renameAccount(
  id: string,
  code: string,
  name: string,
  fetchImpl: FetchLike = fetch
): Promise<StoredAccount> {
  const res = await fetchImpl(`${httpUrl()}/accounts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, recoveryHash: normalizeCode(code) }),
    signal: AbortSignal.timeout(ACCOUNT_TIMEOUT_MS),
  });
  return fromApiResponse(await readJsonOrThrow(res, "account_rename_failed"));
}
