import { useEffect, useRef } from "react";
import { TableEngine } from "./game/engine/tableEngine";

// Хост нового движка стола (client2, автономный). Монтирует движок один раз в свой div.
export function Table() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new TableEngine();
    void engine.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    return () => engine.destroy();
  }, []);

  return (
    <div className="table-screen">
      <div className="table-hint">client2 — новый стол. Тащи карты между зонами (drag-and-drop).</div>
      <div ref={hostRef} className="table-host" />
    </div>
  );
}
