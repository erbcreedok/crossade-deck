import { useEffect, useState } from "react";
import { resolveReduceMotion, type ReduceMotionOverride } from "./game/anim/reduceMotion";

const QUERY = "(prefers-reduced-motion: reduce)";

function readOs(): boolean {
  return window.matchMedia?.(QUERY).matches ?? false;
}

/** Эффективный reduce-motion (issue #7): OS `prefers-reduced-motion`, живой (слушает `change`),
 *  плюс юзер-оверрайд поверх (auto=OS, on/off=юзер решил сам). Гард на отсутствие matchMedia → false. */
export function useReducedMotion(override: ReduceMotionOverride = "auto"): boolean {
  const [os, setOs] = useState(readOs);

  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const onChange = () => setOs(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return resolveReduceMotion(os, override);
}
