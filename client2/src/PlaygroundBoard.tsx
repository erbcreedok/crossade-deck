import { useEffect, useRef } from "react";
import { BoardScene } from "./game/boards/scene";
import { sandboxBoard } from "./game/boards/library/sandbox";
import { goApp } from "./nav";

// Песочница — теперь БОРДА (BoardScene + BoardSpec sandbox), а не отдельный движок. Хост тонкий, как
// CrossadeGame: канвас поднимается в свой div. Шаг 1 — закрытая колода-блок на пустом поле; борду
// наполняем дальше. «← меню» уводит в главное меню (BoardScene своей кнопки назад не рисует).
export function PlaygroundBoard() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new BoardScene({ spec: sandboxBoard() });
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
