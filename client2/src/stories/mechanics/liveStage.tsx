// ДВУХЭКРАННЫЙ LIVE-СТЕНД сторибука: две BoardScene (p1 слева, p2 справа) над ОДНИМ localDriver —
// один снимок на всех, минимум событий. Общий для секций Mechanics/Hand и Mechanics/Hud: сцены
// в `window.__stories` (дев-хук e2e), пересборка — по deps (контролы стори крутят спеку).

import { useEffect, useRef } from "react";
import { BoardScene } from "../../game/boards/scene/scene";
import { localDriver } from "../../game/boards/core/driver";
import type { BoardCommand, BoardSpec } from "../../game/boards/core/spec";

export interface LiveTwoPaneProps {
  spec(): BoardSpec;
  /** Пересборка стенда: значения контролов, от которых зависит спека. */
  deps: readonly unknown[];
  onCommand?(cmd: BoardCommand): void;
  /** После маунта обоих экранов (раздать карты и т.п.) — команды тем же портом, что и палец. */
  ready?(s1: BoardScene): void;
}

export function LiveTwoPane({ spec, deps, onCommand, ready }: LiveTwoPaneProps) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    const s = spec();
    const driver = localDriver(s, 2); // ОДИН порт на оба экрана
    const s1 = new BoardScene({ spec: s, driver, selfSeat: "p1", seats: 2, onCommand });
    const s2 = new BoardScene({ spec: s, driver, selfSeat: "p2", seats: 2 });
    (window as unknown as { __stories?: BoardScene[] }).__stories = [s1, s2];
    const w = () => Math.max(320, (left.parentElement?.clientWidth ?? 1280) / 2 - 2);
    void Promise.all([s1.mount(left, w(), left.clientHeight || 720), s2.mount(right, w(), right.clientHeight || 720)]).then(() => ready?.(s1));
    return () => [s1, s2].forEach((sc) => sc.destroy());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- пересборка ровно по контролам стори
  }, deps);
  const pane = { width: "50%", height: "100vh", touchAction: "none", overflow: "hidden" } as const;
  return (
    <div style={{ display: "flex", gap: 2, background: "#20291f" }}>
      <div ref={leftRef} style={{ ...pane, background: "#2f3d34" }} />
      <div ref={rightRef} style={{ ...pane, background: "#2c3a36" }} />
    </div>
  );
}
