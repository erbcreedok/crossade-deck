import { useEffect, useRef, useState } from "react";
import { CensorDemo, DANCE_DEFAULT, type DanceParams } from "./game/censorDemo";
import { goApp } from "./nav";

// Стенд анимаций «/motion» — испытательная площадка для движущихся объектов/эффектов (то, что не
// проверить статичными скриншотами). Сейчас на ней витрина «цензурной» анимации скрытой карты.
// Слайдеры: общая скорость + живая настройка карты «танец ⚙» (частица / свапы / дрожание / частота).
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
    if (import.meta.env.DEV) (window as unknown as { __censor?: CensorDemo }).__censor = engine;
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

  // .fd-zoom в песочнице позиционируется absolute (один контрол над канвасом). Здесь контролов
  // много — держим их обычными flex-детьми топбара, иначе они стакаются в одну точку и перекрывают
  // друг друга (дотянуться можно лишь до верхнего). ctl сбрасывает position в static.
  const ctl: React.CSSProperties = { position: "static", flex: "none" };
  // Подпись фикс-ширины: число значения меняет ширину («26»→«120») и толкало бы слайдер вбок —
  // он «прыгал». Фикс-ширина + tabular-nums держат старт input'а на месте.
  const cap: React.CSSProperties = { display: "inline-block", width: 104, fontVariantNumeric: "tabular-nums" };

  return (
    <div className="table-screen freedesk">
      <div className="fd-topbar" style={{ flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button className="fd-btn" onClick={() => goApp("free-desk")}>
          ← в песочницу
        </button>
        <button className="fd-btn" onClick={() => engineRef.current?.rerender()}>
          ⟳ ререндер
        </button>
        <label className="fd-zoom" style={ctl}>
          <span style={cap}>скорость {speed.toFixed(1)}x</span>
          <input type="range" min={0} max={3} step={0.1} value={speed} onChange={(e) => { const s = Number(e.target.value); setSpeed(s); engineRef.current?.setSpeed(s); }} />
        </label>
        <span style={{ opacity: 0.6, fontSize: 13 }}>танец ⚙:</span>
        <label className="fd-zoom" style={ctl}>
          <span style={cap}>частица {dance.block}</span>
          <input type="range" min={2} max={10} step={0.5} value={dance.block} onChange={setParam("block")} />
        </label>
        <label className="fd-zoom" style={ctl}>
          <span style={cap}>свапы/с {dance.swapsPerSec}</span>
          <input type="range" min={0} max={120} step={1} value={dance.swapsPerSec} onChange={setParam("swapsPerSec")} />
        </label>
        <label className="fd-zoom" style={ctl}>
          <span style={cap}>дрожание {dance.jitterAmp}</span>
          <input type="range" min={0} max={4} step={0.1} value={dance.jitterAmp} onChange={setParam("jitterAmp")} />
        </label>
        <label className="fd-zoom" style={ctl}>
          <span style={cap}>частота {dance.jitterFreq}</span>
          <input type="range" min={0} max={14} step={0.5} value={dance.jitterFreq} onChange={setParam("jitterFreq")} />
        </label>
      </div>
      <div ref={hostRef} className="table-host" style={{ overflow: "auto" }} />
    </div>
  );
}
