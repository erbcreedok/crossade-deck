import { useEffect, useRef, useState } from "react";
import { BoardScene, type SceneTool } from "./game/boards/scene";
import { sandboxBoard } from "./game/sandbox/board";
import { DEFAULT_SANDBOX_SETTINGS } from "./game/sandbox/settings";
import { sandboxMenus } from "./game/sandbox/menus";
import { joinSandboxLive, type SandboxLiveSession } from "./game/sandbox/live";
import { goApp } from "./nav";

// Песочница — тонкий React-хост НАД канвасом (как CrossadeGame): весь игровой UI рисует движок.
// Соло по умолчанию (одно место, никаких фантомных игроков); настройки — long-press/ПКМ прямо на
// борде (game/sandbox/menus). Live — канвас-кнопка: подключение к sandbox_room (без токена →
// рандом-ник), бейдж «ник · комната КОД» всегда виден, «код…» — перейти в другую комнату.
// HTML здесь только над-игровой: «← меню» (той же природы, что и раньше).

export function PlaygroundBoard() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const liveRef = useRef<SandboxLiveSession | null>(null);
  const [live, setLive] = useState<SandboxLiveSession | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    liveRef.current = live;

    const connect = async (code?: string): Promise<void> => {
      sceneRef.current?.setBadge("подключение…");
      try {
        const next = await joinSandboxLive({ code });
        liveRef.current?.leave();
        setLive(next);
      } catch {
        sceneRef.current?.setBadge(code ? `комната ${code} не найдена` : "сервер недоступен");
      }
    };

    // Временный мост для ввода кода: системный prompt (канвас-инпут — отдельная задача).
    const askCode = (): void => {
      const c = window.prompt("код комнаты (4 цифры)")?.trim();
      if (c && /^\d{4}$/.test(c)) void connect(c);
    };

    const tools: SceneTool[] = live
      ? [
          { key: "code", label: "код…", onClick: askCode },
          { key: "leave", label: "выйти", onClick: () => { liveRef.current?.leave(); setLive(null); } },
        ]
      : [{ key: "live", label: "live", onClick: () => void connect() }];

    // Live-меню настроек: применяет СЕССИЯ (миграция + раздача комнате), посадки крутит комната.
    const liveMenus = live
      ? sandboxMenus(live.settings, (s) => sandboxBoard(s), () => sceneRef.current, {
          onApply: (s) => liveRef.current?.changeSettings(s),
          lockSeats: true,
        })
      : null;
    const scene = live
      ? new BoardScene({
          spec: live.spec,
          driver: live.driver,
          selfSeat: live.you.seat ?? "p1",
          interactive: live.you.seat !== null, // без места — призрак: смотрит и водит курсором
          tools,
          menus: liveMenus!,
          presence: {
            hub: live.hub,
            who: live.you.id,
            palette: (who) => live.colorOf(who),
            label: (who) => live.roster().find((m) => m.id === who)?.name ?? who,
          },
        })
      : new BoardScene({
          spec: sandboxBoard(),
          seats: DEFAULT_SANDBOX_SETTINGS.seats,
          tools,
          menus: sandboxMenus(DEFAULT_SANDBOX_SETTINGS, (s) => sandboxBoard(s), () => sceneRef.current),
        });
    sceneRef.current = scene;
    // Смена настроек (своя или чужая): меню показывает свежие значения, сцена пересобирает спеку.
    if (live) {
      live.onSpec((spec, s) => {
        liveMenus?.setSettings(s);
        sceneRef.current?.applySpec(spec);
      });
    }
    if (import.meta.env.DEV) (window as unknown as { __sandbox?: unknown }).__sandbox = scene; // e2e-хук
    void scene.mount(host, host.clientWidth || 360, host.clientHeight || 640).then(() => {
      if (live) scene.setBadge(`${live.you.name} · комната ${live.code}${live.you.seat === null ? " · наблюдатель" : ""}`);
    });
    return () => {
      sceneRef.current = null;
      scene.destroy();
    };
  }, [live]);

  useEffect(() => () => liveRef.current?.leave(), []);

  return (
    <div className="table-screen">
      <div
        ref={hostRef}
        className="table-host"
        onPointerMove={(e) => {
          if (!liveRef.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          sceneRef.current?.reportCursor(e.clientX - r.left, e.clientY - r.top);
        }}
        onPointerLeave={() => liveRef.current && sceneRef.current?.reportCursor(0, 0, false)}
      />
      <button className="fd-btn back-float" onClick={() => goApp("")}>
        ← меню
      </button>
    </div>
  );
}
