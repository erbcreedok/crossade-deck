import { useEffect, useRef, useState } from "react";
import { CensorDemo, DANCE_DEFAULT, type DanceParams } from "./game/censorDemo";
import { goApp } from "./nav";

// ВРЕМЕННАЯ страница «/censor» — витрина анимации цензуры скрытой карты. Выбираем вид глазами.
// Удалить после выбора (страница + роут в main.tsx). Слайдеры: общая скорость + живая настройка
// карты «танец ⚙» (размер частиц / частота свапов / амплитуда дрожания).
export function CensorDemoPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CensorDemo | null>(null);
  const [speed, setSpeed] = useState(1);
  const [dance, setDance] = useState<DanceParams>(DANCE_DEFAULT);

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

  const setParam = (k: keyof DanceParams) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setDance((d) => ({ ...d, [k]: v }));
    engineRef.current?.updateDance({ [k]: v });
  };

  return (
    <div className="table-screen freedesk">
      <div className="fd-topbar" style={{ flexWrap: "wrap", gap: 10 }}>
        <button className="fd-btn" onClick={() => goApp("free-desk")}>
          ← в песочницу
        </button>
        <label className="fd-zoom">
          скорость {speed.toFixed(1)}x
          <input type="range" min={0} max={3} step={0.1} value={speed} onChange={(e) => { const s = Number(e.target.value); setSpeed(s); engineRef.current?.setSpeed(s); }} />
        </label>
        <span style={{ opacity: 0.6, fontSize: 13 }}>танец ⚙:</span>
        <label className="fd-zoom">
          частица {dance.block}
          <input type="range" min={2} max={10} step={0.5} value={dance.block} onChange={setParam("block")} />
        </label>
        <label className="fd-zoom">
          свапы/с {dance.swapsPerSec}
          <input type="range" min={0} max={120} step={1} value={dance.swapsPerSec} onChange={setParam("swapsPerSec")} />
        </label>
        <label className="fd-zoom">
          дрожание {dance.jitterAmp}
          <input type="range" min={0} max={4} step={0.1} value={dance.jitterAmp} onChange={setParam("jitterAmp")} />
        </label>
        <label className="fd-zoom">
          частота {dance.jitterFreq}
          <input type="range" min={0} max={14} step={0.5} value={dance.jitterFreq} onChange={setParam("jitterFreq")} />
        </label>
      </div>
      <div ref={hostRef} className="table-host" style={{ overflow: "auto" }} />
    </div>
  );
}
