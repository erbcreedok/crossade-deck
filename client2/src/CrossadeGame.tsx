import { useEffect, useRef } from "react";
import type { Room } from "colyseus.js";
import { CrossadeLobbyScene } from "./game/crossade/lobbyScene";
import { CrossadeScene } from "./game/crossade/scene";
import { goApp } from "./nav";

// Хост Crossade — тонкий, как SolitaireGame.tsx: канвас поднимается в СВОЙ div, HUD/лобби целиком
// на нём. Два действующих лица по очереди в ОДНОМ И ТОМ ЖЕ месте монтирования: лобби (вход в
// комнату) и стол (CrossadeScene) — они не сосуществуют, каждое монтируется/сносится заново, когда
// приходит его черёд (mount/destroy — тот же контракт CanvasApp, что и у Косынки).
export function CrossadeGame() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let current: { destroy(): void } | null = null;

    const devHook = (v: unknown): void => {
      if (import.meta.env.DEV) (window as unknown as { __cro?: unknown }).__cro = v;
    };

    const mountLobby = (): void => {
      const lobby = new CrossadeLobbyScene();
      current = lobby;
      lobby.setOnBack(() => goApp(""));
      lobby.setOnJoined((room: Room) => {
        if (cancelled) return;
        lobby.destroy();
        mountTable(room);
      });
      devHook(lobby);
      void lobby.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    };

    const mountTable = (room: Room): void => {
      const scene = new CrossadeScene({
        room,
        selfSessionId: room.sessionId,
        onBack: () => {
          room.leave();
          scene.destroy();
          if (!cancelled) mountLobby();
        },
      });
      current = scene;
      devHook(scene);
      void scene.mount(host, host.clientWidth || 360, host.clientHeight || 640);
    };

    mountLobby();
    return () => {
      cancelled = true;
      current?.destroy();
    };
  }, []);

  return (
    <div className="table-screen">
      <div ref={hostRef} className="table-host" />
    </div>
  );
}
