// ХРАНИЛИЩЕ СТОЛА — то единственное, с чем говорит экран.
//
// Экрану всё равно, откуда стол: из сети (`netStore`) или из этой же вкладки, где за столом боты
// (`localStore`, стенд). Он читает снимок, шлёт намерения и слушает, когда снимок сменился. Отказ
// сервера приходит тем же путём: снимок снова тот, что был, — и экран просто рисует его.

import type { Intent, Person, Refusal, Snapshot } from "../src/table/contract.js";

export interface TableStore {
  readonly me: Person;
  readonly title: string;
  readonly state: Snapshot;
  send(intent: Intent): void;
  /** Снимок сменился (дифом, синком или отказом). */
  onChange(listener: () => void): void;
  /** Намерение не случилось — экран отпускает то, что держал. */
  onRefused(listener: (intent: Intent, why: Refusal) => void): void;
}
