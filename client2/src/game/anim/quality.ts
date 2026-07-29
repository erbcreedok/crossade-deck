// Профиль качества анимации (issue #8): бинарный тир full ↔ reduced. «Авто» понижает тир при
// просадке FPS и возвращает при восстановлении (гистерезис — два порога, чтобы не «моргало» на
// границе). Юзер может форсировать тир поверх авто. Чистая логика (без Pixi/таймеров) — под тесты;
// сам замер FPS живёт в FpsMeter, а прогон в цикле кадра — в CanvasApp.

export type QualityTier = "full" | "reduced";
export type ProfileOverride = "auto" | "full" | "reduced";

// Пороги гистерезиса при цели 60fps: устойчиво ниже DOWN → понижаем; выше UP → возвращаем.
// Зазор (DOWN<UP) не даёт дёргаться на кадрах, болтающихся у одной границы.
export const FPS_DOWN = 45;
export const FPS_UP = 55;

/** Эффективный тир: авто отдаёт замеренный, форс — заданный юзером. */
export function resolveProfile(override: ProfileOverride, auto: QualityTier): QualityTier {
  return override === "auto" ? auto : override;
}

/** Следующий авто-тир из сглаженного FPS и текущего (гистерезис). null (мало данных) → не трогаем. */
export function nextTier(fps: number | null, current: QualityTier): QualityTier {
  if (fps === null) return current;
  if (current === "full" && fps < FPS_DOWN) return "reduced";
  if (current === "reduced" && fps > FPS_UP) return "full";
  return current;
}
