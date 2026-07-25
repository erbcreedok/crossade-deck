import { useEffect, useRef, useState } from "react";
import { FreeDeskEngine, type ViewState } from "./game/engine/freeDeskEngine";

// UI-kit «/free-desk» — сторибук на канвасе (пан + зум + drag-and-drop карт/кнопок). На
// телефоне управление жестами; на компе поверх канваса — скроллбар (трек+ползунок) и слайдер
// зума (по ховеру).
export function FreeDesk() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<FreeDeskEngine | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startScroll: number } | null>(null);
  const [view, setView] = useState<ViewState | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new FreeDeskEngine();
    engineRef.current = engine;
    engine.setOnView(setView);
    void engine.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const onThumbDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startScroll: view?.scroll ?? 0 };
  };
  const onThumbMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const track = trackRef.current;
    if (!d || !track || !view) return;
    const range = track.clientWidth * (1 - view.thumb); // px, на которые ходит ползунок
    if (range <= 0) return;
    engineRef.current?.setScroll(Math.max(0, Math.min(1, d.startScroll + (e.clientX - d.startX) / range)));
  };
  const onThumbUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* уже отпущен */
    }
  };

  return (
    <div className="table-screen freedesk">
      <div ref={hostRef} className="table-host" />

      {/* Полосы — только на устройствах с ховером (комп); на тач-экране их скрывает CSS. */}
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
          {view.scrollable && (
            <div className="fd-scrollbar" ref={trackRef}>
              <div
                className="fd-scrollbar-thumb"
                style={{ width: `${view.thumb * 100}%`, left: `${view.scroll * (1 - view.thumb) * 100}%` }}
                onPointerDown={onThumbDown}
                onPointerMove={onThumbMove}
                onPointerUp={onThumbUp}
                onPointerCancel={onThumbUp}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
