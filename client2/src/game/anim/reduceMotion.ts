// Разрешение эффективного reduce-motion (issue #7): OS `prefers-reduced-motion` — дефолт,
// юзер-оверрайд решает поверх него. auto = слушать ОС; on/off = юзер решил сам, ОС игнорируется.
// Не экран настроек и не переработка физики/фила — только эта одна развилка (см. issue #7).

export type ReduceMotionOverride = "auto" | "on" | "off";

export function resolveReduceMotion(os: boolean, override: ReduceMotionOverride): boolean {
  if (override === "on") return true;
  if (override === "off") return false;
  return os;
}
