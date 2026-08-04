import { useEffect, useRef } from "react";
import { BoardScene } from "./game/boards/scene";
import { sandboxBoard } from "./game/boards/library/sandbox";
import { DEFAULT_SANDBOX_SETTINGS } from "./game/boards/settings";
import { goApp } from "./nav";

// Песочница — БОРДА (BoardScene + сборка sandboxBoard из настроек): круглый стол, посадки вокруг,
// колода в центре, по дефолту всё круг и динамично. Настройки крутятся ПРЯМО в песочнице —
// long-press по гриду/борде (ПКМ на десктопе), у колоды/карты свои меню и фикс-дропзоны при драге.
// «← меню» уводит в главное меню (BoardScene своей кнопки назад не рисует).
export function PlaygroundBoard() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({
      spec: sandboxBoard(),
      seats: DEFAULT_SANDBOX_SETTINGS.seats,
      configurable: { settings: DEFAULT_SANDBOX_SETTINGS, build: (s) => sandboxBoard(s) },
    });
    if (import.meta.env.DEV) (window as unknown as { __sandbox?: unknown }).__sandbox = scene; // e2e-хук
    void scene.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    return () => scene.destroy();
  }, []);

  return (
    <div className="table-screen">
      <div ref={hostRef} className="table-host" />
      <button className="fd-btn back-float" onClick={() => goApp("")}>
        ← меню
      </button>
    </div>
  );
}
