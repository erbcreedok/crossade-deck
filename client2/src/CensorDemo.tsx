import { useEffect, useRef, useState } from "react";
import { CensorDemo } from "./game/censorDemo";
import { goApp } from "./nav";

// ВРЕМЕННАЯ страница «/censor» — витрина анимации цензуры скрытой карты. Выбираем вид глазами.
// Удалить после выбора (страница + роут в main.tsx). Слайдер скорости — проверить множитель 1x/2x.
export function CensorDemoPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CensorDemo | null>(null);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new CensorDemo();
    engineRef.current = engine;
    void engine.mount(host, host.clientWidth || 1000, host.clientHeight || 340);
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  return (
    <div className="table-screen freedesk">
      <div className="fd-topbar">
        <button className="fd-btn" onClick={() => goApp("free-desk")}>
          ← в песочницу
        </button>
        <label className="fd-zoom" style={{ marginLeft: 12 }}>
          скорость {speed.toFixed(1)}x
          <input
            type="range"
            min={0}
            max={3}
            step={0.1}
            value={speed}
            onChange={(e) => {
              const s = Number(e.target.value);
              setSpeed(s);
              engineRef.current?.setSpeed(s);
            }}
          />
        </label>
      </div>
      <div ref={hostRef} className="table-host" style={{ overflow: "auto" }} />
    </div>
  );
}
