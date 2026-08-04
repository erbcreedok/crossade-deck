// ДРАЙВЕР БОРДЫ — кто исполняет команды порта (CONTROL-DESIGN: у движка одна дверь, рулят
// сменные драйверы). Сцена не знает, локальный под ней мок или общий мастер на N клиентов —
// ровно тот же шов, что SendableRoom у мультиплеера.

import { applyCommand, bootState } from "./mock";
import type { BoardState } from "./state";
import type { BoardCommand, BoardSpec } from "./spec";

export interface BoardDriver {
  /** Снимок «как открыли стол». */
  boot(): BoardState;
  /** Предложить команду. Локальный мок применяет сам; общий мастер — единожды за всех. */
  dispatch(cmd: BoardCommand): void;
  /** Подписка на авторитетные снимки (включая эхо своих команд). */
  onState(cb: (s: BoardState) => void): void;
  dispose?(): void;
}

/** Локальный драйвер — standalone-режим: смарт-мок прямо под сценой, без сети и задержек.
 *  `initial` — готовый снимок вместо setup-спеки (реконфигурация песочницы мигрирует состояние). */
export function localDriver(spec: BoardSpec, seats?: number, occupants?: readonly (string | null)[], initial?: BoardState): BoardDriver {
  let state = initial ?? bootState(spec, seats, occupants);
  const subs: ((s: BoardState) => void)[] = [];
  return {
    boot: () => state,
    dispatch(cmd) {
      const next = applyCommand(spec, state, cmd, Math.random);
      if (next === state) return;
      state = next;
      for (const cb of subs) cb(state);
    },
    onState(cb) {
      subs.push(cb);
    },
  };
}
