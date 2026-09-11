// ЧТО ТЕЛЕГА ПРЕДЛАГАЕТ ВЗЯТЬ СЮДА — и в каком порядке об этом спрашивают.
//
// ПО ОДНОМУ ВОПРОСУ ЗА РАЗ: сначала имя, потом лицо. Два разом читаются как «прими всё или ничего»,
// а человек чаще хочет чужое имя и своё лицо.
//
// У КОГО СВОЕГО НЕТ ВОВСЕ — НЕ СПРАШИВАЮТ. Спрашивать «взять ли твоё имя» у того, у кого имени ещё
// нет, незачем: он не выбирал ничего, и отказ оставил бы его с кличкой, которую он и пришёл менять.

import type { Account } from "./accounts.js";
import type { Identity } from "./db/accountsRepo.js";

/** О чём сейчас спрашивают. `none` — спрашивать нечего или уже всё спросили. */
export type OfferKind = "none" | "name" | "photo";

export interface Offer {
  readonly kind: OfferKind;
  /** Имя, которое предлагают взять. */
  readonly name?: string;
  /** Лицо, которое предлагают взять. */
  readonly photo?: string;
  /** Обе стороны пусты у человека — берём молча, не спрашивая. */
  readonly silent: boolean;
}

const NOTHING: Offer = { kind: "none", silent: false };

/**
 * ЧТО ПРЕДЛОЖИТЬ ЭТОМУ ЧЕЛОВЕКУ, глядя на его аккаунт и на то, что помнит дверь.
 *
 * Предлагается только то, чего у него НЕТ или что у него ДРУГОЕ: имя, совпадающее с тамошним, не
 * повод для вопроса.
 */
export function offerFor(account: Account, door: Identity | undefined, nameChosen: boolean): Offer {
  if (!door) return NOTHING;
  // ОТ ЧЕГО ОТКАЗАЛИСЬ — ТОГО И НЕТ: «оставить своё» это решение, а не отложенный вопрос.
  const theirName = door.declinedName ? undefined : door.offeredName?.trim() || undefined;
  const theirPhoto = door.declinedPhoto ? undefined : door.offeredPhoto?.trim() || undefined;
  if (!theirName && !theirPhoto) return NOTHING;

  const hasOwnName = nameChosen;
  const hasOwnFace = Boolean(account.avatar);

  // НИЧЕГО СВОЕГО — БЕРЁМ МОЛЧА. Это и есть «вошёл через телегу с нуля»: имя и лицо просто
  // становятся его, без единого вопроса.
  if (!hasOwnName && !hasOwnFace) {
    return {
      kind: "none",
      silent: true,
      ...(theirName ? { name: theirName } : {}),
      ...(theirPhoto ? { photo: theirPhoto } : {}),
    };
  }

  // ЧТО СПРОСИТЬ СЕЙЧАС — сначала имя, потом лицо. Но в ответе едет ВСЁ, что дверь может дать:
  // «один вопрос за раз» — правило про то, что спрашивают, а не про то, что передают. Экран, не
  // знающий про второе, на отказ от первого закрывал бы разговор совсем.
  const both = {
    ...(theirName ? { name: theirName } : {}),
    ...(theirPhoto ? { photo: theirPhoto } : {}),
    silent: false,
  };
  if (theirName && theirName !== account.name) return { kind: "name", ...both };
  if (theirPhoto && theirPhoto !== account.avatar) return { kind: "photo", ...both };
  return NOTHING;
}
