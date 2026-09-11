// РУЧКИ ПЕРВОЙ СТРАНИЦЫ — профиль в углу и экран за ним, одним типизированным объектом.
//
// Дефолты — это стенд (`design/hubhome`), как его оставил владелец: они и есть дизайн. Позже
// ручки поедут в настройки графики, поэтому число живёт здесь, а не в разметке.

/** Чем залита шапка первой страницы. У стенда по умолчанию — ничем: полка видна насквозь. */
export type HomeFill = "none" | "glass" | "wood" | "dark" | "fade";

/** Что показывает угол: лицо, лицо с именем, и подпись под именем. */
export type HomeProfile = "avatar+name+note" | "avatar+name" | "avatar" | "none";

export interface HomeLook {
  /** Высота шапки, боковое поле, зазор и скругление — в CSS-пикселях. */
  readonly height: number;
  readonly side: number;
  readonly gap: number;
  readonly radius: number;
  readonly fill: HomeFill;
  /** Диаметр кружка профиля в углу. */
  readonly avatar: number;
  /** И его же на самом экране профиля — там он крупный. */
  readonly avatarBig: number;
  readonly profile: HomeProfile;
  readonly profileSide: "right" | "left";
  /** Экран профиля: лист снизу или во весь экран. */
  readonly sheet: "bottom" | "full";
  /** Сколько экрана лист занимает в высоту, долей. */
  readonly sheetShare: number;
}

/** Ручки стенда, как их оставил владелец. Хаб не переопределяет ничего. */
export const HOME_LOOK: HomeLook = {
  height: 44,
  side: 12,
  gap: 8,
  radius: 8,
  fill: "none",
  avatar: 34,
  avatarBig: 64,
  profile: "avatar+name+note",
  profileSide: "right",
  sheet: "bottom",
  sheetShare: 0.82,
};

export function homeLook(over?: Partial<HomeLook>): HomeLook {
  return over ? { ...HOME_LOOK, ...over } : HOME_LOOK;
}
