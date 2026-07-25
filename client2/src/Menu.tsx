import { useEffect, useRef } from "react";
import { MenuEngine } from "./game/engine/menuEngine";
import { goApp, OLD_CLIENT_URL } from "./nav";

// Главное меню — целиком на канвасе (MenuEngine). Кнопка «песочница» уводит в песочницу.
export function Menu() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new MenuEngine();
    engine.setOnOpenSandbox(() => goApp("free-desk"));
    void engine.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    return () => engine.destroy();
  }, []);

  return (
    <div className="table-screen">
      <div ref={hostRef} className="table-host" />
      {/* Неприметный тумблер на старый клиент (v1). */}
      <a className="ver-switch" href={OLD_CLIENT_URL}>
        v1
      </a>
    </div>
  );
}
