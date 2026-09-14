// ХРАНИЛИЩЕ СТОЛА — то единственное, с чем говорит экран.
//
// Экрану всё равно, откуда стол: из сети (`netStore`) или из этой же вкладки, где за столом боты
// (`localStore`, стенд). Он читает снимок, шлёт намерения и слушает, когда снимок сменился. Отказ
// сервера приходит тем же путём: снимок снова тот, что был, — и экран просто рисует его.

import type { Carry, CarryOut, Intent, Person, Refusal, Snapshot } from "../src/table/contract.js";

export interface TableStore {
  readonly me: Person;
  readonly title: string;
  readonly state: Snapshot;
  send(intent: Intent): void;
  /** Что сейчас в воздухе у других — только то, что ещё держат (по `state.locks`). */
  readonly carries: readonly Carry[];
  /** Мой палец в воздухе — над чем он. Без ответа: это поток, а не намерение. */
  carry(out: CarryOut): void;
  /** Снимок сменился (дифом, синком или отказом) или сдвинулся чужой палец в воздухе. */
  onChange(listener: () => void): void;
  /** Намерение не случилось — экран отпускает то, что держал. */
  onRefused(listener: (intent: Intent, why: Refusal) => void): void;
  /** Стола больше нет: его закрыли в боте, или сервер ушёл. */
  onGone(listener: () => void): void;
}
