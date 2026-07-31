import { useEffect, useRef } from "react";
import { MenuEngine } from "./game/engine/menuEngine";
import { goApp, OLD_CLIENT_URL } from "./nav";
import { formatVersion } from "./version";

// Главное меню — целиком на канвасе (MenuEngine). Кнопка «песочница» уводит в песочницу.
export function Menu() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new MenuEngine();
    engine.setOnOpenSandbox(() => goApp("playground"));
    // Сверх спеки issue #99: сама спека роут не требует ссылку из меню, но без неё игра
    // достижима только руками по адресу — добавляем пункт по образцу «песочницы».
    engine.setOnOpenSolitaire(() => goApp("solitaire"));
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
      {/* Номер сборки — видно по скриншоту, что именно залилось. */}
      <span className="ver-build">{formatVersion()}</span>
    </div>
  );
}
