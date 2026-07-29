import { useEffect, useState } from "react";
import { resolveReduceFlash, type ReduceFlashOverride } from "./game/anim/reduceFlash";

// Своего prefers-reduced-flash в вебе нет — фото-чувствительность наследует prefers-reduced-motion.
const QUERY = "(prefers-reduced-motion: reduce)";

function readOs(): boolean {
  return window.matchMedia?.(QUERY).matches ?? false;
}

/** Эффективный «без вспышек» (issue #9): auto = слушает OS `prefers-reduced-motion` (живой, на `change`),
 *  on/off — юзер решил сам. Гард на отсутствие matchMedia → false. Зеркало useReducedMotion. */
export function useReduceFlash(override: ReduceFlashOverride = "auto"): boolean {
  const [os, setOs] = useState(readOs);

  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const onChange = () => setOs(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return resolveReduceFlash(os, override);
}
