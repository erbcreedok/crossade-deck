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

export async function ensureAccount(): Promise<Account | undefined> {
  const existing = storedAccount();
  if (existing) return existing;

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
