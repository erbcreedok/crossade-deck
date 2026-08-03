// ОБЩИЙ СТОЛ БОРДЫ — in-memory мастер на N клиентов (родня multiplayer/localTable.ts, но поверх
// порта команд борды): авторитетное состояние ОДНО, каждый клиент-драйвер шлёт команды, мастер
// применяет их по одной и рассылает снимок всем (эхо автору включительно). Latency эмулирует оба
// плеча доставки. Подключение реального сервера — замена ЭТОГО файла, сцена и борды не меняются.

import { applyCommand, bootState } from "./mock";
import type { BoardDriver } from "./driver";
import type { BoardState } from "./state";
import type { BoardCommand, BoardSpec } from "./spec";

export interface BoardTableOptions {
  spec: BoardSpec;
  seats?: number;
  /** Задержка каждого плеча (клиент→мастер, мастер→клиент), мс. 0 — синхронно. */
  latencyMs?: number;
  onCommand?: (from: string, cmd: BoardCommand) => void;
}

export interface BoardTable {
  /** Драйвер на каждое место (p1..pN) — раздать сценам клиентов. */
  readonly drivers: readonly (BoardDriver & { seat: string })[];
  /** Авторитетное состояние — читать можно, писать мимо dispatch нельзя. */
  readonly state: BoardState;
  destroy(): void;
}

export function createBoardTable(opts: BoardTableOptions): BoardTable {
  let state = bootState(opts.spec, opts.seats);
  const latency = opts.latencyMs ?? 0;
  const subs: ((s: BoardState) => void)[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let destroyed = false;

  function deliver(fn: () => void): void {
    if (destroyed) return;
    if (latency <= 0) return void fn();
    const t = setTimeout(() => {
      timers.delete(t);
      if (!destroyed) fn();
    }, latency);
    timers.add(t);
  }

  function handle(from: string, cmd: BoardCommand): void {
    opts.onCommand?.(from, cmd);
    const next = applyCommand(opts.spec, state, cmd, Math.random);
    if (next === state) return;
    state = next;
    // Снимок иммутабелен (редьюсер возвращает новые объекты) — рассылаем ссылку без клона.
    const snap = state;
    for (const cb of subs) deliver(() => cb(snap));
  }

  const drivers = state.seats.map((seat) => ({
    seat: seat.id,
    boot: () => state,
    dispatch: (cmd: BoardCommand) => deliver(() => handle(seat.id, cmd)),
    onState: (cb: (s: BoardState) => void) => void subs.push(cb),
  }));

  return {
    drivers,
    get state() {
      return state;
    },
    destroy() {
      destroyed = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
