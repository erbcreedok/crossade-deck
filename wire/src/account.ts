import { serverUrl } from "./server.js";

export type Account = {
  id: string;
  name: string;
  recoveryHash: string;
  /** Любимый цвет и аватар — поля профиля. Их может не быть: человек ещё ничего не выбрал. */
  color?: string;
  avatar?: string;
};

/** Как сервер входит: список провайдеров без их ключей. */
export type Provider = "telegram" | "google" | "apple" | "passkey" | "guest";

/**
 * ПРОФИЛЬ — то же, что аккаунт, но без кода восстановления и с перечнем дверей. Читается с
 * сервера: имя и цвет могли измениться с другого устройства, а `localStorage` этого не знает.
 */
export type Profile = {
  id: string;
  name: string;
  /**
   * Назвался ли человек сам. Ложь — имя ему выдал стол, и это единственное, что подталкивает
   * назваться: экран профиля держится ровно на этой разнице.
   */
  nameChosen: boolean;
  createdAt: number;
  color: string | null;
  avatar: string | null;
  identities: readonly Provider[];
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

/** Профиль того, кто сидит за этим экраном. */
export async function myProfile(): Promise<Profile | undefined> {
  const current = storedAccount();
  if (!current) return undefined;
  try {
    const res = await fetch(`${serverUrl()}/accounts/${current.id}/profile`);
    if (!res.ok) return undefined;
    return (await res.json()) as Profile;
  } catch {
    return undefined;
  }
}

/**
 * ПОМЕНЯТЬ ИМЯ, ЦВЕТ ИЛИ АВАТАР — своим кодом, как и раньше. Пустая строка у цвета и аватара
 * значит «снять»; пустое имя сервер игнорирует.
 */
export async function updateProfile(patch: {
  name?: string;
  color?: string;
  avatar?: string;
}): Promise<Account | undefined> {
  const current = storedAccount();
  if (!current) return undefined;

  try {
    const res = await fetch(`${serverUrl()}/accounts/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, recoveryHash: current.recoveryHash }),
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
  return updateProfile({ name });
}

/** Чем кончилась попытка привязать телеграм к этому аккаунту. */
export type LinkOutcome =
  | { kind: "linked"; account: Account }
  /** Дверь ведёт к другому, настоящему аккаунту — этот экран становится им. */
  | { kind: "switch"; account: Account }
  /** Обе стороны полноценные: не сливаем никогда, только переключаем — решает человек. */
  | { kind: "conflict"; account: { id: string; name: string } };

/**
 * ПРИВЯЗАТЬ ТЕЛЕГРАМ К СВОЕМУ АККАУНТУ — та же подписанная `initData`, что и у входа.
 *
 * `switch` сохраняется локально: человек и правда становится тем аккаунтом. `conflict` не меняет
 * на этом экране ничего — слияние необратимо, и решение здесь не за кодом.
 */
export async function linkTelegram(initData: string): Promise<LinkOutcome | undefined> {
  const current = storedAccount();
  if (!current) return undefined;
  try {
    const res = await fetch(`${serverUrl()}/accounts/${current.id}/identities/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, recoveryHash: current.recoveryHash }),
    });
    const body = await res.json();
    if (res.status === 409) return { kind: "conflict", account: body.account };
    if (!res.ok) return undefined;
    const outcome = body as { kind: "linked" | "switch"; account: Account };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(outcome.account));
    return outcome;
  } catch {
    return undefined;
  }
}
