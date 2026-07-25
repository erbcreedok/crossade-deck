import { useEffect, useRef } from "react";
import { MenuEngine } from "./game/engine/menuEngine";

// Главное меню — целиком на канвасе (MenuEngine). Кнопка «песочница» уводит на /free-desk.
export function Menu() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new MenuEngine();
    engine.setOnOpenSandbox(() => {
      window.location.href = "/free-desk";
    });
    void engine.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    return () => engine.destroy();
  }, []);

  return (
    <div className="table-screen">
      <div ref={hostRef} className="table-host" />
    </div>
  );
}
