import { useEffect, useRef, useState } from "react";
import { FreeDeskEngine, type ViewState } from "./game/engine/freeDeskEngine";

// UI-kit «/free-desk» — сторибук на канвасе (пан + зум + drag-and-drop карт). На телефоне
// управление жестами; на компе поверх канваса — полоса прокрутки и ползунок зума (по ховеру).
export function FreeDesk() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<FreeDeskEngine | null>(null);
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

  return (
    <div className="table-screen freedesk">
      <div ref={hostRef} className="table-host" />

      {/* Мягкое затухание левого и правого краёв в цвет фона — обрез ленты при скролле не
          выглядит резким (карты у края плавно уходят в фон, а не рубятся пополам). */}
      <div className="fd-fade fd-fade-left" />
      <div className="fd-fade fd-fade-right" />

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
            <input
              className="fd-scroll"
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={view.scroll}
              onChange={(e) => engineRef.current?.setScroll(Number(e.target.value))}
            />
          )}
        </div>
      )}
    </div>
  );
}
