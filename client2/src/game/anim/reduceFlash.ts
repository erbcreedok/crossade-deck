// Разрешение эффективного «без вспышек» (issue #9, фото-чувствительность): отдельный от reduce-motion
// пользовательский флаг, гасящий ВСЕ вспышечно-мерцательные анимации (мерцание TG-пыли, дрожь «сжечь»).
// Своего `prefers-reduced-flash` в вебе нет — единственный OS-сигнал это `prefers-reduced-motion`,
// поэтому auto наследует именно его. on/off — юзер решил сам, ОС игнорируется. Чистая развилка под тест.

export type ReduceFlashOverride = "auto" | "on" | "off";

export function resolveReduceFlash(os: boolean, override: ReduceFlashOverride): boolean {
  if (override === "on") return true;
  if (override === "off") return false;
  return os;
}
