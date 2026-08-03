import type { Meta, StoryObj } from "@storybook/react-vite";
import { action } from "storybook/actions";
import { MultiplayerStage } from "./MultiplayerStage";

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
