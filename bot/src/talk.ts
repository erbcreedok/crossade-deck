// РАЗГОВОР ПРО ИМЯ И ЛИЦО — ТАМ, ГДЕ ЧЕЛОВЕК УЖЕ СТОИТ.
//
// Он только что нажал «Запустить» в телеге; спрашивать его на странице, куда он ещё не вернулся, —
// это заставлять его вернуться ради двух кнопок. Поэтому бот говорит: «„Драный олень“ привязан к
// вашему аккаунту. Оставить, взять „Ербол Сыздык“ или ввести своё?» — и то же самое про аватар.
//
// Кнопки телеги отвечают в один тап; «ввести своё» — это следующее сообщение, и бот ждёт его ровно
// от того, кто его попросил.
//
// СОСТОЯНИЕ РАЗГОВОРА ЖИВЁТ В ПАМЯТИ и переживать перезапуск не должно: незаконченный вопрос,
// всплывший через сутки после рестарта, читается как разговор с призраком. Выбор человека при этом
// живёт на сервере — там ему и место.

/** Чего бот ждёт от следующего сообщения этого человека. */
export type Waiting = "name" | "photo";

export interface Pending {
  readonly waiting: Waiting;
  readonly telegramId: string;
  readonly since: number;
}

/** Сколько ждём ответа. Дольше — это уже не разговор, а засада. */
export const WAIT_MS = 10 * 60 * 1000;

const pending = new Map<number, Pending>();

export function askFor(chatId: number, waiting: Waiting, telegramId: string, now = Date.now()): void {
  pending.set(chatId, { waiting, telegramId, since: now });
}

export function waitingIn(chatId: number, now = Date.now()): Pending | undefined {
  const one = pending.get(chatId);
  if (!one) return undefined;
  if (now - one.since >= WAIT_MS) {
    pending.delete(chatId);
    return undefined;
  }
  return one;
}

export function stopWaiting(chatId: number): void {
  pending.delete(chatId);
}

/** Что телега может предложить и о чём бот спрашивает сейчас. */
export interface Offer {
  readonly kind: "none" | "name" | "photo";
  readonly name?: string;
  readonly photo?: string;
}

/** Первая фраза после привязки: как человека зовут здесь — и что с этим можно сделать. */
export function linkedSaid(here: string, offer: Offer): string {
  const head = `«${here}» — так тебя зовут в Crossade.`;
  if (offer.kind === "name" && offer.name) return `${head}\nОставить это имя, взять «${offer.name}» из Telegram или ввести своё?`;
  if (offer.kind === "photo") return `${head}\nВзять аватар из Telegram, прислать свой или оставить как есть?`;
  return `${head}\nВозвращайся на страницу — всё готово.`;
}

/** Что спросить дальше, когда предыдущий вопрос закрыт. */
export function nextSaid(offer: Offer): string | undefined {
  if (offer.kind === "name" && offer.name) return `Взять имя «${offer.name}» из Telegram или ввести своё?`;
  if (offer.kind === "photo") return "Теперь аватар: взять из Telegram, прислать свой или оставить как есть?";
  return undefined;
}

/** Кнопки под вопросом — по одному ряду, потому что читаются они сверху вниз. */
export function buttonsFor(offer: Offer): { text: string; data: string }[][] {
  if (offer.kind === "name") {
    return [
      [{ text: "Оставить своё", data: "keep:name" }],
      [{ text: `Взять «${offer.name ?? ""}»`, data: "take:name" }],
      [{ text: "Ввести своё", data: "type:name" }],
    ];
  }
  if (offer.kind === "photo") {
    return [
      [{ text: "Оставить как есть", data: "keep:photo" }],
      [{ text: "Взять из Telegram", data: "take:photo" }],
      [{ text: "Прислать свой", data: "type:photo" }],
    ];
  }
  return [];
}

/** Имя, каким его примет сервер: без пробелов по краям и не длиннее мерки профиля. */
export const MAX_NAME = 24;

export function cleanName(text: string | undefined): string | undefined {
  const name = text?.trim().replace(/\s+/g, " ");
  if (!name) return undefined;
  return name.slice(0, MAX_NAME);
}
