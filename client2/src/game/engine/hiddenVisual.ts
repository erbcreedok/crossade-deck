import type { QualityTier } from "../anim/quality";

// Понятие "как показывать скрытую карту" — общее для ui/Card и TableEngine (issue #3). Чистая
// функция (без Pixi) под тесты: живая «пыль» на полном профиле без reduce-motion, иначе статичный
// hiddenFace — то же правило, что Card.idleFrozen (reduceMotion || lowFx) применяет к своей пыли.

export type HiddenVisual = "dust" | "static";

export function hiddenVisualFor(profile: QualityTier, reduceMotion: boolean): HiddenVisual {
  return reduceMotion || profile === "reduced" ? "static" : "dust";
}

/** Какую текстуру карте показывать: рубашка бокса важнее скрытости (нечего маскировать, уже спиной). */
export type CardTextureKind = "back" | "face" | "hiddenBg" | "hiddenFace";

export function resolveCardTextureKind(args: { faceUp: boolean; hidden: boolean; visual: HiddenVisual }): CardTextureKind {
  if (!args.faceUp) return "back";
  if (!args.hidden) return "face";
  return args.visual === "dust" ? "hiddenBg" : "hiddenFace";
}
