// РАССАДКА LIVE-КОМНАТЫ — чистые функции: кто реально сидит на стульях борды. Никаких
// мок-фантомов «Игрок N»: в live за столом только живые участники из ростера комнаты,
// пустой стул — occupant null («свободно»). Снимки состояния приезжают от других клиентов
// с ИХ представлением мест — рассадку всегда переписывает ростер (он авторитетнее).

import type { BoardState } from "../boards/state";
import type { LiveMember } from "./live";

/** occupant-массив по местам p1..pN из ростера комнаты. */
export function seatOccupants(members: readonly LiveMember[], seats: number): (string | null)[] {
  return Array.from({ length: seats }, (_, i) => members.find((m) => m.seat === `p${i + 1}`)?.name ?? null);
}

/** Переписать рассадку снимка состоянием комнаты (сами карты/слоты не трогаются). */
export function withOccupants(state: BoardState, occupants: readonly (string | null)[]): BoardState {
  return {
    ...state,
    seats: state.seats.map((s, i) => ({ ...s, occupant: occupants[i] ?? null })),
  };
}
