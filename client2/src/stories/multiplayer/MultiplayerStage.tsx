import { useEffect, useMemo, useRef } from "react";
import { createLocalTable, type LocalClient, type LocalTraffic } from "../../game/multiplayer/localTable";
import { MultiplayerScene } from "../../game/multiplayer/scene";

// React-хост секции Mechanics/Multiplayer: ОДИН локальный мастер (localTable.ts) и N независимых
// клиентов гридом на одной странице. Каждая ячейка — свой канвас, своя сцена, свой sessionId:
// ровно то, что на проде будет N телефонов. Паттерн монтирования — CrossadeGame.tsx (ref на div,
// сцена в useEffect, destroy в cleanup); пула, как у CanvasStage, тут нет намеренно — клиентов
// переменное число, и живут они ровно столько, сколько живёт стори.

/** Что умеет смонтированная сцена клиента — ровно контракт CanvasApp, которым живут обе сцены. */
interface MountableScene {
  mount(host: HTMLElement, width: number, height: number): Promise<void>;
  destroy(): void;
}

export interface MultiplayerStageProps {
  players: number;
  latency: number;
  handSize: number;
  onTraffic?: (evt: LocalTraffic) => void;
  /** Какую сцену поднимать в ячейке. По умолчанию — базовый стол (MultiplayerScene);
   *  live-стори передаёт сюда LiveTableScene со своей палитрой. */
  makeScene?: (client: LocalClient) => MountableScene;
}

function ClientCell({ client, makeScene }: { client: LocalClient; makeScene?: (client: LocalClient) => MountableScene }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = makeScene
      ? makeScene(client)
      : new MultiplayerScene({ room: client, selfSessionId: client.sessionId });
    // Хук на живые сцены — та же идиома, что __kit/__sol: канвас не отдаёт ни DOM-узлов, ни ролей.
    const g = globalThis as unknown as { __mp?: Record<string, MountableScene> };
    (g.__mp ??= {})[client.sessionId] = scene;
    void scene.mount(host, host.clientWidth || 360, host.clientHeight || 420);
    return () => {
      delete g.__mp?.[client.sessionId];
      scene.destroy();
    };
  }, [client]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ font: "13px monospace", color: "#9aa89f", padding: "4px 6px" }}>
        {client.name} · {client.sessionId}
      </div>
      <div ref={hostRef} style={{ flex: 1, minHeight: 260, background: "#2f3d34", touchAction: "none", overflow: "hidden" }} />
    </div>
  );
}

export function MultiplayerStage({ players, latency, handSize, onTraffic, makeScene }: MultiplayerStageProps) {
  const onTrafficRef = useRef(onTraffic);
  onTrafficRef.current = onTraffic;

  // Мастер живёт, пока живут его аргументы: смена любого — новый стол с новой раздачей.
  // onTraffic нарочно через ref: слушатель панели Actions не повод пересоздавать стол.
  const table = useMemo(
    () => createLocalTable({ players, latencyMs: latency, handSize, onTraffic: (e) => onTrafficRef.current?.(e) }),
    [players, latency, handSize],
  );
  useEffect(() => () => table.destroy(), [table]);

  const cols = players <= 2 ? players : Math.ceil(players / 2);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 8,
        width: "100%",
        height: "100vh",
        boxSizing: "border-box",
        padding: 8,
        // Тёмная подложка вместо шахматки сторибука в зазорах: зазор — часть страницы секции,
        // а просвечивающая клетка читается как «канвас не догрузился» (то же правило, что у сукна).
        background: "#222b26",
      }}
    >
      {table.clients.map((c) => (
        <ClientCell key={`${c.sessionId}-${players}-${latency}-${handSize}`} client={c} makeScene={makeScene} />
      ))}
    </div>
  );
}
