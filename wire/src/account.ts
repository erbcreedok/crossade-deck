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

/** Забыть, кем этот браузер себя считал. */
export function forgetAccount(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Приватное окно без хранилища — забывать и нечего.
  }
}

/**
 * Профиль того, кто сидит за этим экраном.
 *
 * АККАУНТ, КОТОРОГО СЕРВЕР НЕ ЗНАЕТ, ЗАБЫВАЕТСЯ ЗДЕСЬ ЖЕ. В `localStorage` лежит только id и код —
 * сам человек живёт на сервере, и «сервер отвечает 404 на меня» значит, что этой записи больше
 * нет: база сменилась, аккаунт удалили, вкладка старше сервера. Без этого экран оставался бы пустым
 * НАВСЕГДА: профиля нет, завести новый нечем — сохранённый id мешает, — и человеку нечего нажать.
 *
 * 404 — это ответ. Обрыв сети им не является: там мы ничего не знаем и ничего не забываем.
 */
export async function myProfile(): Promise<Profile | undefined> {
  const current = storedAccount();
  if (!current) return undefined;
  try {
    const res = await fetch(`${serverUrl()}/accounts/${current.id}/profile`);
    if (res.status === 404) {
      forgetAccount();
      return undefined;
    }
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

/**
 * ССЫЛКА В БОТА, КОТОРОЙ ПРИВЯЗЫВАЮТ ТЕЛЕГРАМ ИЗ ОБЫЧНОГО БРАУЗЕРА.
 *
 * Обратный поток: не мы ищем человека в телеге (бот и не может — ни по номеру, ни по @username), а
 * он открывает бота, и телега сама говорит боту, кто он.
 */
export type TelegramInvite = {
  code: string;
  link: string;
  expiresInMs: number;
};

/**
 * ПОЧЕМУ ССЫЛКИ НЕТ — это разные вещи, и человеку они говорятся по-разному: «не настроено» значит
 * жать бесполезно, «слишком часто» — подожди полминуты, «нет связи» — попробуй ещё.
 */
export type InviteRefusal = "not-configured" | "too-soon" | "offline";

/** Попросить ссылку на бота — или узнать, почему её нет. */
export async function telegramInvite(): Promise<TelegramInvite | InviteRefusal> {
  const current = storedAccount();
  if (!current) return "offline";
  try {
    const res = await fetch(`${serverUrl()}/auth/telegram/link-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: current.id, recoveryHash: current.recoveryHash }),
    });
    if (res.status === 429) return "too-soon";
    if (res.status === 503) return "not-configured";
    if (!res.ok) return "offline";
    return (await res.json()) as TelegramInvite;
  } catch {
    return "offline";
  }
}

/** Чем кончилось ожидание бота. `waiting` — человек ещё не нажал «Запустить». */
export type InviteState = "waiting" | "linked" | "switch" | "conflict" | "expired";

/**
 * СПРОСИТЬ, ЧЕМ КОНЧИЛОСЬ. Исход приходит один раз и уносит код с собой: страница, которая
 * переспросит, получит `expired` — и это правильно, ожидание кончилось.
 *
 * `switch` сохраняется локально, как и у входа через Mini App: человек и правда становится тем
 * аккаунтом.
 */
export async function telegramInviteState(code: string): Promise<InviteState> {
  try {
    const res = await fetch(`${serverUrl()}/auth/telegram/link-code/${encodeURIComponent(code)}`);
    if (!res.ok) return "expired";
    const body = (await res.json()) as { state: InviteState; account?: Account };
    if ((body.state === "switch" || body.state === "linked") && body.account) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(body.account));
    }
    return body.state;
  } catch {
    // Сеть моргнула — ожидание не кончилось, спросим снова.
    return "waiting";
  }
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
