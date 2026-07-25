import { useEffect, useRef } from "react";
import { FreeDeskEngine } from "./game/engine/freeDeskEngine";

// UI-kit «/free-desk» — сторибук на канвасе (скролл + drag-and-drop карт).
export function FreeDesk() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new FreeDeskEngine();
    void engine.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    return () => engine.destroy();
  }, []);

  return <div ref={hostRef} className="table-host" />;
}
