// LIVE-ПЕСОЧНИЦА: подключение к комнате sandbox_room и обёртка её сообщений в те же контракты,
// на которых сцена живёт локально — BoardDriver (команды/снимки) и PresenceHub (локи/курсоры).
// Сцена разницы не видит: это ровно тот шов, который обещали boardTable.ts и presence.ts.
//
// Канон v1 «клиент считает — сервер раздаёт»: dispatch применяет команду локальным смарт-моком
// СРАЗУ (мгновенный отклик) и шлёт серверу команду + готовый снимок; чужие ходы приезжают
// снимком и просто принимаются. Вход без токена — сервер выдаст ник «Красная панда»; сохранённый
// аккаунт первого клиента (localStorage) едет как есть.

import { Client, type Room } from "colyseus.js";
import { httpUrl, serverUrl } from "../../net/runtimeConfig";
import { browserAccountStorage, loadAccount } from "../../net/account";
import { applyCommand, bootState } from "../boards/mock";
import { migrateState } from "../boards/migrate";
import { sandboxBoard } from "./board";
import { DEFAULT_SANDBOX_SETTINGS, type SandboxSettings } from "./settings";
import { seatOccupants, withOccupants } from "./liveSeats";
import type { BoardDriver } from "../boards/driver";
import type { PresenceHub, PresenceView } from "../boards/presence";
import type { BoardSpec } from "../boards/spec";
import { ensureVisuals } from "../boards/state";
import type { BoardState } from "../boards/state";

export interface LiveMember {
  id: string;
  name: string;
  color: number;
  seat: string | null;
}

export interface SandboxLiveSession {
  you: LiveMember;
  code: string;
  seats: number;
  /** Актуальные настройки борды комнаты (welcome или дефолт). */
  readonly settings: SandboxSettings;
  /** Спека борды по этим настройкам (посадки — всегда комнатные). */
  readonly spec: BoardSpec;
  /** Сменить настройки: миграция снимка + раздача комнате (стол у всех одинаковый). */
  changeSettings(s: SandboxSettings): void;
  /** Спека сменилась (своя или чужая правка настроек): пересобрать сцену (applySpec). */
  onSpec(cb: (spec: BoardSpec, s: SandboxSettings) => void): void;
  driver: BoardDriver;
  hub: PresenceHub;
  roster(): readonly LiveMember[];
  onRoster(cb: (members: readonly LiveMember[]) => void): void;
  colorOf(who: string): number;
  leave(): void;
}

const CURSOR_WIRE_INTERVAL_MS = 50; // тот же темп, что у multiplayer/localTable

let sharedClient: Client | undefined;
function client(): Client {
  if (!sharedClient) sharedClient = new Client(serverUrl());
  return sharedClient;
}

interface Welcome {
  you: LiveMember;
  code: string;
  roomId: string;
  seats: number;
  state: BoardState | null;
  settings: SandboxSettings | null;
  roster: LiveMember[];
}

export async function joinSandboxLive(opts: { code?: string } = {}): Promise<SandboxLiveSession> {
  const account = loadAccount(browserAccountStorage());
  const joinOpts = account ? { accountId: account.id, name: account.name } : {};

  let room: Room;
  if (opts.code) {
    const res = await fetch(`${httpUrl()}/rooms/by-code/${encodeURIComponent(opts.code)}`);
    if (!res.ok) throw new Error("room_not_found");
    const { roomId } = (await res.json()) as { roomId: string };
    room = await client().joinById(roomId, joinOpts);
  } else {
    room = await client().joinOrCreate("sandbox_room", joinOpts);
  }

  // Рукопожатие: сперва подписка, потом «hello» — welcome, отправленный до onMessage, был бы уронен.
  const welcome = await new Promise<Welcome>((resolve) => {
    room.onMessage("welcome", resolve);
    room.send("hello");
  });

  // ——— роստер: id → участник (имена и цвета для присутствия) ———
  let members = new Map(welcome.roster.map((m) => [m.id, m]));
  const rosterSubs: ((m: readonly LiveMember[]) => void)[] = [];

  // ——— драйвер борды поверх комнаты ———
  // Рассадку ЛЮБОГО снимка переписывает ростер комнаты: никаких мок-фантомов «Игрок N» и
  // никакого доверия чужому представлению мест — авторитет по стульям один (комната).
  const occupants = (): (string | null)[] => seatOccupants([...members.values()], welcome.seats);
  // Настройки и спека — СЕССИИ (комната их синкает): посадки всегда комнатные, меню их не крутит.
  const buildSpec = (s: SandboxSettings): BoardSpec => sandboxBoard({ ...s, seats: welcome.seats });
  let settings: SandboxSettings = welcome.settings ?? { ...DEFAULT_SANDBOX_SETTINGS, seats: welcome.seats };
  let spec: BoardSpec = buildSpec(settings);
  const specSubs: ((sp: BoardSpec, s: SandboxSettings) => void)[] = [];
  const emitSpec = (): void => {
    for (const cb of specSubs) cb(spec, settings);
  };
  // Снимок из сети нормируем: старый формат без free/fx (стол у всех одинаковый) не роняет клиента.
  let state: BoardState = withOccupants(ensureVisuals(welcome.state ?? bootState(spec, welcome.seats)), occupants());
  const stateSubs: ((s: BoardState) => void)[] = [];
  const emitState = (): void => {
    for (const cb of stateSubs) cb(state);
  };
  room.onMessage("roster", (msg: { members: LiveMember[] }) => {
    members = new Map(msg.members.map((m) => [m.id, m]));
    for (const cb of rosterSubs) cb([...members.values()]);
    state = withOccupants(state, occupants());
    emitState();
  });
  room.onMessage("cmd", (msg: { state: BoardState }) => {
    state = withOccupants(ensureVisuals(msg.state), occupants());
    emitState();
  });
  // Чужая правка настроек: спека пересобирается, снимок (уже мигрированный автором) принимается.
  room.onMessage("settings", (msg: { settings: SandboxSettings; state: BoardState }) => {
    settings = msg.settings;
    spec = buildSpec(settings);
    if (msg.state) state = withOccupants(ensureVisuals(msg.state), occupants());
    emitSpec();
    emitState();
  });
  const driver: BoardDriver = {
    boot: () => state,
    dispatch(cmd) {
      const next = applyCommand(spec, state, cmd, Math.random);
      if (next === state) return;
      state = withOccupants(next, occupants());
      emitState();
      room.send("cmd", { cmd, state });
    },
    onState(cb) {
      stateSubs.push(cb);
    },
  };

  // ——— хаб присутствия поверх комнаты ———
  const view: {
    held: Record<string, string>;
    cursors: Record<string, { x: number; y: number }>;
    drags: Record<string, { el: string; at: { x: number; y: number } }>;
  } = { held: {}, cursors: {}, drags: {} };
  const viewSubs: ((v: PresenceView) => void)[] = [];
  const emitView = (): void => {
    const v: PresenceView = { held: { ...view.held }, cursors: { ...view.cursors }, drags: { ...view.drags } };
    for (const cb of viewSubs) cb(v);
  };
  room.onMessage("held", (msg: { held: Record<string, string> }) => {
    view.held = msg.held;
    emitView();
  });
  room.onMessage("cursor", (msg: { who: string; at: { x: number; y: number } | null }) => {
    if (msg.at) view.cursors[msg.who] = msg.at;
    else delete view.cursors[msg.who];
    emitView();
  });
  room.onMessage("drag", (msg: { who: string; el: string | null; at: { x: number; y: number } | null }) => {
    if (msg.at && msg.el) view.drags[msg.who] = { el: msg.el, at: msg.at };
    else delete view.drags[msg.who];
    emitView();
  });
  room.onMessage("grab_denied", (msg: { el: string }) => {
    // Оптимистичный лок не подтвердился — первый успел не я: чужой захват уже едет в "held".
    delete view.held[msg.el];
    emitView();
  });

  let lastCursorSent = 0;
  let lastDragSent = 0;
  const hub: PresenceHub = {
    grab(who, el) {
      const owner = view.held[el];
      if (owner && owner !== who) return false;
      view.held[el] = who; // оптимистично: гонку подтвердит/отменит сервер (grab_denied)
      emitView();
      room.send("grab", { el });
      return true;
    },
    release(who, el) {
      if (view.held[el] !== who) return;
      delete view.held[el];
      emitView();
      room.send("release", { el });
    },
    heldBy: (el) => view.held[el] ?? null,
    cursor(_who, at) {
      const now = Date.now();
      if (at && now - lastCursorSent < CURSOR_WIRE_INTERVAL_MS) return;
      lastCursorSent = now;
      room.send("cursor", { at });
    },
    drag(_who, el, at) {
      // Свой драг по проводу, себе не эхо (карта и так в пальцах). Темп курсора; null — конец.
      const now = Date.now();
      if (at && now - lastDragSent < CURSOR_WIRE_INTERVAL_MS) return;
      lastDragSent = now;
      room.send("drag", { el, at });
    },
    view: () => ({ held: { ...view.held }, cursors: { ...view.cursors }, drags: { ...view.drags } }),
    onChange(cb) {
      viewSubs.push(cb);
    },
  };

  return {
    you: welcome.you,
    code: welcome.code,
    seats: welcome.seats,
    get settings() {
      return settings;
    },
    get spec() {
      return spec;
    },
    changeSettings(next) {
      settings = next;
      spec = buildSpec(settings);
      state = withOccupants(migrateState(state, spec, welcome.seats), occupants());
      room.send("settings", { settings, state });
      emitSpec();
      emitState();
    },
    onSpec(cb) {
      specSubs.push(cb);
    },
    driver,
    hub,
    roster: () => [...members.values()],
    onRoster(cb) {
      rosterSubs.push(cb);
    },
    colorOf(who) {
      return members.get(who)?.color ?? 0x9aa89f;
    },
    leave() {
      void room.leave();
    },
  };
}
