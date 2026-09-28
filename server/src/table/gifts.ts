// ВЫДАТЬ ПОЛОЖЕННЫЕ НАГРАДЫ (`rewards.ts`) — записать в инвентарь, надеть, если сидит стартовым, и написать в личку
// от бота. Зовут двое: профиль (подарок за Telegram) и комната (он и фигура колоды за первую комнату).
//
// Личка — Bot API напрямую, тем же токеном, что у стола (`config.botToken`): процесс бота для этого не нужен. Не
// дошло (бот не запущен у человека, сети нет) — награда всё равно выдана, её видно в профиле.

import { grantParts, ownedParts } from "../db/tableOwnedRepo.js";
import { saveTableProfile, tableProfile } from "../db/tableProfilesRepo.js";
import { tableConfig } from "./config.js";
import { ownParts } from "./dolls.js";
import { giftsDue, giftText, ownedOf, putOn, STARTER_SET, wearable, type Gift } from "./rewards.js";
import { partsFor } from "./skins.js";

/** Написать человеку в личку от бота. Тесты в Telegram не ходят. */
export async function mailGift(key: string, text: string, http: typeof fetch = fetch): Promise<boolean> {
  const token = tableConfig().botToken;
  const chat = key.startsWith("tg:") ? key.slice(3) : null;
  if (!token || !chat || process.env.VITEST) return false;
  try {
    const res = await http(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text }),
    });
    return ((await res.json()) as { ok?: boolean }).ok === true;
  } catch {
    return false;
  }
}

/**
 * ВЫДАТЬ, ЧТО ПОЛОЖЕНО: `inRoom` — он садится в комнату. Отвечает, что выдано (пусто — ничего). База недоступна —
 * ничего. Письма уходят в фоне и порядок держат: сначала аватар, потом фигура.
 */
export function grantDue(key: string, inRoom: boolean, mail: (key: string, text: string) => Promise<unknown> = mailGift): Gift[] {
  try {
    const owned = ownedOf(ownedParts(key));
    const gifts = giftsDue(key, owned, inRoom);
    if (gifts.length === 0) return [];
    // Чем он сидит на самом деле — выбранным, если оно у него есть; стартовым — если нет.
    const was = tableProfile(key);
    const worn = wearable(partsFor(was?.doll ?? STARTER_SET, ownParts(was?.parts)), owned);
    for (const gift of gifts) grantParts(key, gift.parts, gift.why);
    const on = putOn(worn, gifts);
    if (on) saveTableProfile(key, { ...(on.doll ? { doll: on.doll } : {}), parts: on.parts ? JSON.stringify({ ...ownParts(was?.parts), ...on.parts }) : null });
    void gifts.reduce<Promise<unknown>>((after, gift) => after.then(() => mail(key, giftText(gift))).catch(() => undefined), Promise.resolve());
    return gifts;
  } catch {
    return [];
  }
}
