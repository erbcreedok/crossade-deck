import type { TableElement } from "../engine/element";
import { asBurnable, asDraggable, asFlippable, asPeekable } from "../engine/capabilities";

// Pile — явный агрегат: «чем является набор» (SELECTION-DESIGN §3). Обобщает анонимный GroupDrag и
// board-pile (play:N/дека/сброс). ЧИСТАЯ функция над членами: теги (для предикатов зон/правил),
// facing (для карт) и способности как ПЕРЕСЕЧЕНИЕ («Pile умеет X ⇔ все члены умеют X» — та же
// логика els.every(asX) из drag.ts, поднятая на уровень набора).

export type Facing = "up" | "down" | "mixed" | "none";

export interface PileCapabilities {
  draggable: boolean; // все члены реально тащибельны (draggable === true)
  flippable: boolean;
  burnable: boolean;
  peekable: boolean; // все структурно Peekable (есть ли что раскрывать — вопрос рантайма canPeek)
}

export interface PileIdentity {
  size: number;
  tagsAll: Set<string>; // теги, что есть у ВСЕХ (пересечение) — «однороден по…»
  tagsAny: Set<string>; // теги, что есть хоть у одного (объединение)
  facing: Facing; // ориентация карт-членов; "none" — карт нет
  capabilities: PileCapabilities;
}

/** Ориентация одного элемента: карта отдаёт faceUp, прочие — null (в facing не участвуют). */
function faceUpOf(el: TableElement): boolean | null {
  return "faceUp" in el ? ((el as unknown as { faceUp: boolean }).faceUp ? true : false) : null;
}

/** Идентичность набора. Пустой набор → нулевой агрегат (facing "none", все способности false). */
export function pileIdentity(members: readonly TableElement[]): PileIdentity {
  const empty = members.length === 0;

  // теги: пересечение (tagsAll) и объединение (tagsAny)
  const tagsAny = new Set<string>();
  let tagsAll: Set<string> | null = null;
  for (const el of members) {
    const t = el.tags;
    for (const x of t) tagsAny.add(x);
    if (tagsAll === null) tagsAll = new Set(t);
    else for (const x of [...tagsAll]) if (!t.has(x)) tagsAll.delete(x);
  }

  // facing по картам-членам
  let up = 0;
  let down = 0;
  for (const el of members) {
    const f = faceUpOf(el);
    if (f === true) up++;
    else if (f === false) down++;
  }
  let facing: Facing = "none";
  if (up > 0 && down > 0) facing = "mixed";
  else if (up > 0) facing = "up";
  else if (down > 0) facing = "down";

  const every = (fn: (el: TableElement) => boolean) => !empty && members.every(fn);

  return {
    size: members.length,
    tagsAll: tagsAll ?? new Set(),
    tagsAny,
    facing,
    capabilities: {
      draggable: every((el) => asDraggable(el)?.draggable === true),
      flippable: every((el) => asFlippable(el) !== null),
      burnable: every((el) => asBurnable(el) !== null),
      peekable: every((el) => asPeekable(el) !== null),
    },
  };
}
