// НАМЕРЕНИЕ ХОДА — что дроп ЗНАЧИТ, отдельно от того, чем его отправить. Оба сетевых стола
// (Crossade и дебаг-стол Multiplayer) читают дроп одними правилами (moveRules.ts) и получают
// намерение одного вида; порт зовётся ровно в одном месте — sendMove.
//
// Разделение на «серверный» и «локальный» ход — не оформление, а разные судьбы: ServerMove уходит
// командой и ЖДЁТ ответа (сцена дебаг-стола вешает на него ожидание, см. multiplayer/pending.ts),
// LocalMove применяется оптимистично и серверу отправляется уже посчитанным результатом (реордер
// руки — см. crossade/scene.ts#reorderHand).

import type { CrossadePort } from "./net";

/** Ход, который решает сервер: сцена только произносит его, правил не проверяет. */
export type ServerMove =
  | { kind: "play_card"; card: string; stack?: number }
  | { kind: "discard_card"; card: string }
  | { kind: "take_play"; card: string }
  | { kind: "take_discard" }
  | { kind: "take_card" }
  | { kind: "deal_card"; card: string; seat: string };

/** Ход, который сцена применяет сама: состав зон не меняется, меняется только показанный порядок. */
export type LocalMove = { kind: "reorder_hand"; card: string; toIndex: number };

export type MoveIntent = ServerMove | LocalMove;

export function isServerMove(m: MoveIntent): m is ServerMove {
  return m.kind !== "reorder_hand";
}

/** Произнести ход в порт. Имена и формы аргументов — дело net.ts#makePort, здесь только выбор
 *  двери: switch исчерпывающий (never-ветка), поэтому новый вид хода нельзя завести и забыть. */
export function sendMove(port: CrossadePort, m: ServerMove): void {
  switch (m.kind) {
    case "play_card":
      if (m.stack === undefined) port.playCard(m.card);
      else port.playCard(m.card, m.stack);
      return;
    case "discard_card":
      port.discardCard(m.card);
      return;
    case "take_play":
      port.takePlay(m.card);
      return;
    case "take_discard":
      port.takeDiscard();
      return;
    case "take_card":
      port.takeCard();
      return;
    case "deal_card":
      port.dealCard(m.card, m.seat);
      return;
    default: {
      const never: never = m;
      return never;
    }
  }
}
