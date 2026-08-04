import { useEffect, useRef, useState } from "react";
import { BoardScene } from "./game/boards/scene";
import { sandboxBoard } from "./game/boards/library/sandbox";
import { DEFAULT_SANDBOX_SETTINGS } from "./game/boards/settings";
import { joinSandboxLive, type SandboxLiveSession } from "./net/sandboxLive";
import { goApp } from "./nav";

// Песочница — БОРДА (BoardScene + сборка sandboxBoard из настроек): круглый стол, посадки вокруг,
// колода в центре, по дефолту всё круг и динамично. Настройки крутятся ПРЯМО в песочнице —
// long-press по гриду/борде (ПКМ на десктопе), у колоды/карты свои меню и фикс-дропзоны при драге.
//
// LIVE: кнопка подключает к комнате sandbox_room (как Figma/Miro): без токена — рандом-ник
// («Красная панда»), до 12 человек; КОД комнаты виден всегда, и по коду можно перейти в другую.
// Кто первым схватил элемент — тот им и управляет; настройки борды в live пока заморожены
// (меню настроек работает в одиночном режиме).
export function PlaygroundBoard() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const [live, setLive] = useState<SandboxLiveSession | null>(null);
  const [joining, setJoining] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const spec = sandboxBoard();
    const scene = new BoardScene(
      live
        ? {
            spec,
            driver: live.driver,
            selfSeat: live.you.seat ?? "p1",
            interactive: live.you.seat !== null, // без места — призрак: смотрит и водит курсором
            presence: {
              hub: live.hub,
              who: live.you.id,
              palette: (who) => live.colorOf(who),
              label: (who) => live.roster().find((m) => m.id === who)?.name ?? who,
            },
          }
        : {
            spec,
            seats: DEFAULT_SANDBOX_SETTINGS.seats,
            configurable: { settings: DEFAULT_SANDBOX_SETTINGS, build: (s) => sandboxBoard(s) },
          },
    );
    sceneRef.current = scene;
    if (import.meta.env.DEV) (window as unknown as { __sandbox?: unknown }).__sandbox = scene; // e2e-хук
    void scene.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    return () => {
      sceneRef.current = null;
      scene.destroy();
    };
  }, [live]);

  useEffect(() => () => live?.leave(), [live]);

  async function connect(code?: string): Promise<void> {
    setJoining(true);
    setError(null);
    try {
      const next = await joinSandboxLive(sandboxBoard(), { code });
      live?.leave();
      setLive(next);
    } catch {
      setError(code ? `комната ${code} не найдена` : "сервер недоступен");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="table-screen">
      <div
        ref={hostRef}
        className="table-host"
        onPointerMove={(e) => {
          if (!live) return;
          const r = e.currentTarget.getBoundingClientRect();
          sceneRef.current?.reportCursor(e.clientX - r.left, e.clientY - r.top);
        }}
        onPointerLeave={() => live && sceneRef.current?.reportCursor(0, 0, false)}
      />
      <button className="fd-btn back-float" onClick={() => goApp("")}>
        ← меню
      </button>
      <div className="sandbox-live-bar">
        {live ? (
          <>
            <span className="sandbox-live-code">
              {live.you.name} · комната {live.code}
              {live.you.seat === null ? " · наблюдатель" : ""}
            </span>
            <input
              className="sandbox-live-input"
              value={codeInput}
              placeholder="код…"
              maxLength={4}
              onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ""))}
            />
            <button className="fd-btn" disabled={joining || codeInput.length !== 4} onClick={() => void connect(codeInput)}>
              перейти
            </button>
            <button
              className="fd-btn"
              onClick={() => {
                live.leave();
                setLive(null);
              }}
            >
              выйти
            </button>
          </>
        ) : (
          <button className="fd-btn" disabled={joining} onClick={() => void connect()}>
            {joining ? "подключение…" : "live"}
          </button>
        )}
        {error && <span className="sandbox-live-error">{error}</span>}
      </div>
    </div>
  );
}
