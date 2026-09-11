import { serverUrl } from "./server.js";

export type Account = {
  id: string;
  name: string;
  recoveryHash: string;
};

const STORAGE_KEY = "crossade.account";

export function storedAccount(): Account | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Account;
    if (typeof parsed?.id === "string" && typeof parsed?.name === "string" && typeof parsed?.recoveryHash === "string") {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * A Telegram Mini App carries its own identity in `initData` — signed by the bot token, so the
 * server can trust it without a password. It is exchanged for the same kind of account a guest
 * gets (`POST /auth/telegram`), so the rest of the app never has to know which door a player came
 * in through.
 */
export async function telegramAccount(initData: string): Promise<Account | undefined> {
  try {
    const res = await fetch(`${serverUrl()}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    if (!res.ok) return undefined;
    const account = (await res.json()) as Account;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    return account;
  } catch {
    return undefined;
  }
}

export async function ensureAccount(): Promise<Account | undefined> {
  const existing = storedAccount();
  if (existing) return existing;

  const initData = (globalThis as any).Telegram?.WebApp?.initData;
  if (typeof initData === "string" && initData.length > 0) {
    const viaTelegram = await telegramAccount(initData);
    if (viaTelegram) return viaTelegram;
  }

  try {
    const res = await fetch(`${serverUrl()}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return undefined;
    const account = (await res.json()) as Account;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    return account;
  } catch {
    return undefined;
  }
}

export async function restoreAccount(code: string): Promise<Account | undefined> {
  try {
    const res = await fetch(`${serverUrl()}/accounts/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recoveryHash: code }),
    });
    if (!res.ok) return undefined;
    const account = (await res.json()) as Account;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    return account;
  } catch {
    return undefined;
  }
}

export async function renameAccount(name: string): Promise<Account | undefined> {
  const current = storedAccount();
  if (!current) return undefined;

  try {
    const res = await fetch(`${serverUrl()}/accounts/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, recoveryHash: current.recoveryHash }),
    });
    if (!res.ok) return undefined;
    const account = (await res.json()) as Account;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    return account;
  } catch {
    return undefined;
  }
}
