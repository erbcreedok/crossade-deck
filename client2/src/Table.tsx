import { useEffect, useRef } from "react";
import { BoardScene } from "./game/boards/scene/scene";
import { deck36 } from "./game/boards/library/decks";
import type { BoardSpec } from "./game/boards/core/spec";
import { handZone } from "./game/boards/library/strips";
import { useReducedMotion } from "./useReducedMotion";

// «Простенькая песочница» /table — теперь ОБЫЧНАЯ борда (никакого своего движка): колода, стол
// и сброс + рука. Старый автономный TableEngine (до-SceneEngine эпоха, свой drag/пул/цензура)
// снесён — те же жесты даёт generic-BoardScene поверх общего движка.
function tableSpec(): BoardSpec {
  const { cards, ids } = deck36();
  return {
    id: "table",
    title: "",
    elements: cards,
    zones: [
      { id: "deck", title: "колода", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: ids } },
      { id: "play", title: "стол", layout: { kind: "flow", cols: { min: 3, max: 5 }, center: true }, policy: { onOccupied: "merge" }, frame: "dashed" },
      { id: "discard", title: "сброс", layout: { kind: "pile" }, policy: { onOccupied: "merge" } },
      handZone(),
    ],
    seats: { count: { fixed: 1 }, show: "none", swap: false },
    actions: [],
  };
}

export function Table() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({ spec: tableSpec(), seats: 1 });
    sceneRef.current = scene;
    if (import.meta.env.DEV) (window as unknown as { __table?: unknown }).__table = scene; // e2e-хук
    void scene.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.rt.setReduceMotion(reduceMotion);
  }, [reduceMotion]);

  return (
    <div className="table-screen">
      <div className="table-hint">Стол: тащи карты между колодой, столом, сбросом и рукой.</div>
      <div ref={hostRef} className="table-host" />
    </div>
  );
}
