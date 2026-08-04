// LIVE-ПЕСОЧНИЦА: подключение к комнате sandbox_room и обёртка её сообщений в те же контракты,
// на которых сцена живёт локально — BoardDriver (команды/снимки) и PresenceHub (локи/курсоры).
// Сцена разницы не видит: это ровно тот шов, который обещали boardTable.ts и presence.ts.
//
// Канон v1 «клиент считает — сервер раздаёт»: dispatch применяет команду локальным смарт-моком
// СРАЗУ (мгновенный отклик) и шлёт серверу команду + готовый снимок; чужие ходы приезжают
// снимком и просто принимаются. Вход без токена — сервер выдаст ник «Красная панда»; сохранённый
// аккаунт первого клиента (localStorage) едет как есть.

import { Client, type Room } from "colyseus.js";
import { httpUrl, serverUrl } from "./runtimeConfig";
import { browserAccountStorage, loadAccount } from "./account";
import { applyCommand, bootState } from "../game/boards/mock";
import type { BoardDriver } from "../game/boards/driver";
import type { PresenceHub, PresenceView } from "../game/boards/presence";
import type { BoardSpec } from "../game/boards/spec";
import type { BoardState } from "../game/boards/state";

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
  roster: LiveMember[];
}

export async function joinSandboxLive(spec: BoardSpec, opts: { code?: string } = {}): Promise<SandboxLiveSession> {
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
  room.onMessage("roster", (msg: { members: LiveMember[] }) => {
    members = new Map(msg.members.map((m) => [m.id, m]));
    for (const cb of rosterSubs) cb([...members.values()]);
  });

  // ——— драйвер борды поверх комнаты ———
  let state: BoardState = welcome.state ?? bootState(spec, welcome.seats);
  const stateSubs: ((s: BoardState) => void)[] = [];
  const emitState = (): void => {
    for (const cb of stateSubs) cb(state);
  };
  room.onMessage("cmd", (msg: { state: BoardState }) => {
    state = msg.state;
    emitState();
  });
  const driver: BoardDriver = {
    boot: () => state,
    dispatch(cmd) {
      const next = applyCommand(spec, state, cmd, Math.random);
      if (next === state) return;
      state = next;
      emitState();
      room.send("cmd", { cmd, state });
    },
    onState(cb) {
      stateSubs.push(cb);
    },
  };

  // ——— хаб присутствия поверх комнаты ———
  const view: { held: Record<string, string>; cursors: Record<string, { x: number; y: number }> } = { held: {}, cursors: {} };
  const viewSubs: ((v: PresenceView) => void)[] = [];
  const emitView = (): void => {
    const v: PresenceView = { held: { ...view.held }, cursors: { ...view.cursors } };
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
  room.onMessage("grab_denied", (msg: { el: string }) => {
    // Оптимистичный лок не подтвердился — первый успел не я: чужой захват уже едет в "held".
    delete view.held[msg.el];
    emitView();
  });

  let lastCursorSent = 0;
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
    view: () => ({ held: { ...view.held }, cursors: { ...view.cursors } }),
    onChange(cb) {
      viewSubs.push(cb);
    },
  };

  return {
    you: welcome.you,
    code: welcome.code,
    seats: welcome.seats,
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
