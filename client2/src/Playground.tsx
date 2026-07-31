import { useEffect, useRef, useState } from "react";
import { PlaygroundEngine, type ViewState } from "./game/engine/playgroundEngine";
import { goApp } from "./nav";
import { useReducedMotion } from "./useReducedMotion";

// UI-kit «/playground» — сторибук на канвасе (пан + зум + drag-and-drop карт/кнопок). Хост —
// голый контейнер под канвас: топбар (в меню / рестарты) рисует сам движок в экранном слое
// (ui/TopBar.ts), HTML тут не остаётся.
//
// Скроллбары и слайдер зума — сознательное исключение «дев/тест-назначения»: это аффорданс
// СТЕНДА для мыши, а не элемент приложения. В игровых сценах их нет.
export function Playground() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PlaygroundEngine | null>(null);
  const trackXRef = useRef<HTMLDivElement>(null);
  const trackYRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ axis: "x" | "y"; start: number; scroll: number } | null>(null);
  const [view, setView] = useState<ViewState | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // onBack — движок не знает про роутинг приложения; кнопка «в меню» его топбара зовёт хост.
    const engine = new PlaygroundEngine(undefined, () => goApp(""));
    engineRef.current = engine;
    if (import.meta.env.DEV) (window as unknown as { __fd?: PlaygroundEngine }).__fd = engine; // e2e-хук
    engine.setOnView(setView);
    void engine.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setReduceMotion(reduceMotion);
  }, [reduceMotion]);

  const thumbDown = (axis: "x" | "y") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      axis,
      start: axis === "x" ? e.clientX : e.clientY,
      scroll: view ? (axis === "x" ? view.scrollX : view.scrollY) : 0,
    };
  };
  const thumbMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !view) return;
    const track = d.axis === "x" ? trackXRef.current : trackYRef.current;
    if (!track) return;
    const size = d.axis === "x" ? track.clientWidth : track.clientHeight;
    const thumb = d.axis === "x" ? view.thumbX : view.thumbY;
    const range = size * (1 - thumb); // px, на которые ходит ползунок
    if (range <= 0) return;
    const delta = (d.axis === "x" ? e.clientX : e.clientY) - d.start;
    const next = Math.max(0, Math.min(1, d.scroll + delta / range));
    if (d.axis === "x") engineRef.current?.setScrollX(next);
    else engineRef.current?.setScrollY(next);
  };
  const thumbUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* уже отпущен */
    }
  };

  return (
    <div className="table-screen playground">
      <div ref={hostRef} className="table-host" />

      {view && (
        <div className="fd-controls">
          <label className="fd-zoom">
            зум
            <input
              type="range"
              min={view.minZoom}
              max={view.maxZoom}
              step={0.01}
              value={view.zoom}
              onChange={(e) => engineRef.current?.setZoom(Number(e.target.value))}
            />
          </label>

          {view.scrollableX && (
            <div className="fd-scrollbar fd-scrollbar-x" ref={trackXRef}>
              <div
                className="fd-scrollbar-thumb"
                style={{ width: `${view.thumbX * 100}%`, left: `${view.scrollX * (1 - view.thumbX) * 100}%` }}
                onPointerDown={thumbDown("x")}
                onPointerMove={thumbMove}
                onPointerUp={thumbUp}
                onPointerCancel={thumbUp}
              />
            </div>
          )}

          {view.scrollableY && (
            <div className="fd-scrollbar fd-scrollbar-y" ref={trackYRef}>
              <div
                className="fd-scrollbar-thumb"
                style={{ height: `${view.thumbY * 100}%`, top: `${view.scrollY * (1 - view.thumbY) * 100}%` }}
                onPointerDown={thumbDown("y")}
                onPointerMove={thumbMove}
                onPointerUp={thumbUp}
                onPointerCancel={thumbUp}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
