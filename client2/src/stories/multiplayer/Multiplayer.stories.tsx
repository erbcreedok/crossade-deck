import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { MultiplayerStage } from "./MultiplayerStage";
import { LiveTableScene } from "../../game/multiplayer/liveScene";

interface Args {
  players: number;
  latency: number;
  handSize: number;
}

const onTraffic = action("send → master");

/**
 * ЛОКАЛЬНЫЙ МУЛЬТИПЛЕЕР — N клиентов одного стола на одной странице.
 *
 * Сервера нет: авторитетное состояние держит in-memory мастер (`game/multiplayer/localTable.ts`),
 * а каждая ячейка грида — полноценный клиент со своим канвасом и своим `sessionId`. Действие в
 * одной ячейке (потащите карту в общую зону) прилетает остальным ровно тем же путём, каким его
 * принёс бы сервер: у автора всё «как есть», у других — программатически, снимком состояния.
 *
 * Шов — форма colyseus-Room (`SendableRoom + BindableRoom` из `crossade/net.ts`): сцена не знает,
 * что сервер фейковый, и подключение реального сокета — замена `LocalClient` на настоящую комнату,
 * без правки сцены. Протокол — имена серверных сообщений 1:1 (`play_card` / `take_play` /
 * `set_hand_order`). Дизайн: `docs/MULTIPLAYER-DESIGN.md`.
 *
 * Проверяется только МЫШЬЮ: сыграйте карту в одном клиенте и смотрите на соседние.
 */
const meta: Meta<Args> = {
  title: "Mechanics/Multiplayer",
  args: { players: 4, latency: 0, handSize: 6 },
  argTypes: {
    players: {
      name: "players",
      description: "сколько клиентов открыть на странице — у каждого свой канвас, своя рука и свой sessionId; на проде это N телефонов",
      control: { type: "range", min: 2, max: 6, step: 1 },
    },
    latency: {
      name: "latency",
      description:
        "задержка КАЖДОГО плеча доставки (клиент→мастер и мастер→клиент), мс: свой ход возвращается эхом через 2×latency — так видно, что переживёт реальную сеть, ещё до сокета",
      control: { type: "range", min: 0, max: 600, step: 50 },
    },
    handSize: {
      name: "handSize",
      description: "карт на руку при старте — мастер раздаёт их с верха перетасованной колоды по кругу",
      control: { type: "range", min: 1, max: 10, step: 1 },
    },
  },
  parameters: {
    layout: "fullscreen",
    code: (a: Record<string, unknown>) => `import { createLocalTable } from "../../game/multiplayer/localTable";
import { MultiplayerScene } from "../../game/multiplayer/scene";

// ОДИН in-memory мастер — авторитетное состояние и семантика доставки (broadcast всем, эхо
// автору, задержка). Клиенты — форма colyseus-Room: сцена не знает, что сервер фейковый.
const table = createLocalTable({ players: ${a.players}, latencyMs: ${a.latency}, handSize: ${a.handSize} });

// Каждому клиенту — своя сцена в свой div. На проде здесь будет настоящая colyseus-комната.
for (const client of table.clients) {
  const scene = new MultiplayerScene({ room: client, selfSessionId: client.sessionId });
  void scene.mount(hostOf(client), width, height);
}`,
  },
  render: (a) => <MultiplayerStage players={a.players} latency={a.latency} handSize={a.handSize} onTraffic={onTraffic} />,
};
export default meta;

/**
 * Стол на несколько клиентов. Что стоит сделать руками:
 *
 *   • потащите карту из руки в общую зону в ОДНОМ клиенте — кучка появится у всех, а счёт карт
 *     на месте автора уменьшится у соседей;
 *   • заберите ЧУЖУЮ сыгранную карту со стола в другом клиенте — зона общая, забирает любой;
 *   • переставьте карты своей руки — соседям не прилетает ничего видимого: порядок чужой руки
 *     не их дело, но счёт и кучки живут общим состоянием;
 *   • выкрутите `latency` — свой ход начнёт «доезжать» с опозданием эха: ровно то, что покажет
 *     реальный сокет, и повод ловить stale-echo уже сейчас.
 */
export const Table: StoryObj<Args> = {};

interface LiveArgs extends Args {
  p1Color: string;
  p2Color: string;
  p3Color: string;
  p4Color: string;
  p5Color: string;
  p6Color: string;
}

const LIVE_COLORS = { p1Color: "#e05555", p2Color: "#4c9ae0", p3Color: "#5ec46a", p4Color: "#e0a24c", p5Color: "#b06ae0", p6Color: "#4cc8c8" };

function colorArg(i: number) {
  return {
    name: `p${i}Color`,
    description: `цвет присутствия игрока ${i}: обводка карты, которую он трогает, и его имя у всех зрителей`,
    control: { type: "color" as const },
  };
}

/**
 * ЖИВОЙ СТОЛ — тот же авторитетный мультиплеер, плюс presence как в Figma/Miro.
 *
 * Сцена у всех ОДНА (публичные зоны — общая и сброс — на одинаковых координатах у каждого
 * зрителя), перспектива личная: своя рука снизу (она и есть индикатор себя), остальные сверху
 * рядами РУБАШЕК. Номиналов чужих рук у зрителя нет ФИЗИЧЕСКИ: канал `hands` несёт стабильные
 * opaque-alias, и реордер чужой руки виден движением рубашек, а не значениями.
 *
 * Канал `gesture` транслирует драги: grab/move/release. В публичных зонах карта едет у всех ровно
 * так, как её ведёт автор; над рукой координаты срезаются — видно, ЧТО он драгает, но не куда.
 * Карта под чьим-то пальцем носит обводку цвета игрока (настраивается ниже) — и у автора тоже.
 *
 * Проверяется двумя руками: тащите карту в одной ячейке и смотрите на соседние.
 */
export const LiveTable: StoryObj<LiveArgs> = {
  name: "Live table",
  args: { ...LIVE_COLORS },
  argTypes: {
    p1Color: colorArg(1),
    p2Color: colorArg(2),
    p3Color: colorArg(3),
    p4Color: colorArg(4),
    p5Color: colorArg(5),
    p6Color: colorArg(6),
  },
  parameters: {
    code: (a: Record<string, unknown>) => `import { createLocalTable } from "../../game/multiplayer/localTable";
import { LiveTableScene } from "../../game/multiplayer/liveScene";

const table = createLocalTable({ players: ${a.players}, latencyMs: ${a.latency}, handSize: ${a.handSize} });

// Каналы live-режима у того же мастера: hands (чужие руки opaque-alias'ами) и gesture
// (grab/move/release; над рукой координаты срезаются — приватность навязывает мастер).
const colors = { p1: 0x${String(a.p1Color).slice(1)}, p2: 0x${String(a.p2Color).slice(1)}, /* … */ };
for (const client of table.clients) {
  const scene = new LiveTableScene({ room: client, selfSessionId: client.sessionId, colors });
  void scene.mount(hostOf(client), width, height);
}`,
  },
  render: (a) => {
    const colors: Record<string, number> = {};
    ([a.p1Color, a.p2Color, a.p3Color, a.p4Color, a.p5Color, a.p6Color] as string[]).forEach((hex, i) => {
      colors[`p${i + 1}`] = parseInt((hex ?? "#ffffff").replace("#", ""), 16);
    });
    return (
      <MultiplayerStage
        players={a.players}
        latency={a.latency}
        handSize={a.handSize}
        onTraffic={onTraffic}
        makeScene={(client) => new LiveTableScene({ room: client, selfSessionId: client.sessionId, colors })}
      />
    );
  },
};
