// ЧТО ЭКРАН ГОВОРИТ ПРО ЧЕЛОВЕКА — решения, а не разметка, поэтому их можно проверить без
// документа.
//
// Всё держится на одной разнице: имя СВОЁ или выданное столом. Кличка — единственное, что на
// первой странице подталкивает назваться, и она же решает, гореть ли кнопке золотом, чем залит
// кружок и что написано под именем. Кнопки входа на первой странице нет: авторизация не встречает
// игрока, она появляется там, где без личности нет ответа.

import type { Profile } from "@crossade/wire";

/** Что показывает кружок профиля. */
export type FaceKind =
  /** Эмодзи, которое человек выбрал себе сам. */
  | { readonly kind: "emoji"; readonly emoji: string }
  /** Первая буква своего имени. */
  | { readonly kind: "letter"; readonly letter: string }
  /** Безликий силуэт: имени человек ещё не выбирал. */
  | { readonly kind: "nobody" };

export interface WhoAmI {
  readonly name: string;
  /** Назвался сам — или на нём висит кличка. */
  readonly named: boolean;
  /** Подпись под именем. У безымянного она говорит, откуда имя взялось. */
  readonly note: string;
  readonly face: FaceKind;
  /** Чем залит кружок: своим цветом, если человек его выбрал. */
  readonly ink: string | null;
  /** Что написано на кнопке имени — «Назваться» зовёт, «Сменить» просто есть. */
  readonly nameAction: "invite" | "change";
  /** Есть ли уже дверь, которой можно войти с другого устройства. */
  readonly hasTelegram: boolean;
  /** Как человека зовут за этой дверью — `@erbol`, если телега сказала. */
  readonly telegramName: string | null;
}

/** Что этот экран знает о том, кто перед ним. */
export function whoAmI(profile: Profile): WhoAmI {
  const named = profile.nameChosen;
  const telegram = profile.identities.find((one) => one.provider === "telegram");
  const hasTelegram = telegram !== undefined;
  return {
    name: profile.name,
    named,
    // ГОСТЬ — НЕ «НИКТО», а аккаунт без привязанных дверей, поэтому подпись говорит не «гость без
    // прав», а откуда взялось имя: это то, что человек может изменить.
    note: named ? (hasTelegram ? "" : "гость") : "имя выдал стол",
    face: profile.avatar
      ? { kind: "emoji", emoji: profile.avatar }
      : named
        ? { kind: "letter", letter: profile.name.slice(0, 1) }
        : { kind: "nobody" },
    ink: profile.color,
    nameAction: named ? "change" : "invite",
    hasTelegram,
    telegramName: telegram?.label ?? null,
  };
}
