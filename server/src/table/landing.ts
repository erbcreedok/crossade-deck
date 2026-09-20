// КУДА ЭТО МОЖНО ПОЛОЖИТЬ — один закон на оба конца.
//
// Сервер спрашивает его, чтобы ОТКАЗАТЬ. Экран спрашивает тот же самый, чтобы ПОДСВЕТИТЬ. Пока закон
// знал только сервер, экран зажигал всё подряд: игрок поднимал стопку и видел контуры на стульях,
// куда её всё равно не примут, а узнавал об этом уже отказом.
//
// ОТВЕТ ЗАВИСИТ ОТ ТОГО, ЧТО В РУКЕ. Карта и охапка карт — разные вещи: круг принимает карту, но не
// охапку; чужая рука принимает карту, а охапку — только рука крупье, и то лишь там, где так решил
// род стола. Один вопрос «можно ли» без этого различия отвечал бы неправду половину времени.
//
// Здесь только то, что видно ОБОИМ концам: замки мест и правила рода. Замки самих карт (кто что
// держит) и «не держишь — не кладёшь» остаются на сервере: экран о чужих намерениях не знает и
// знать не должен.

import type { Chair, Snapshot, Where } from "./contract.js";
import { allowed, may } from "./access.js";
import type { DeskRules } from "./rules.js";

/** Что несут: одну карту или охапку — стопку целиком, выделение, руку. */
export type Load = "card" | "pile";

/** Чем стол отвечает на вопрос «можно ли сюда» — и почему нет. */
export interface Landing {
  yes: boolean;
  why?: string;
}

const пусто: Landing = { yes: true };

/**
 * Примет ли это место то, что несут.
 *
 * @param by   кто несёт
 * @param load карта или охапка
 * @param desk правила рода стола; песочница отвечает «да» на всё, что не запрещено замками
 */
export function lands(s: Snapshot, by: string, load: Load, to: Where, desk: DeskRules): Landing {
  if (to.in === "felt") return пусто;

  if (to.in === "deck") {
    const pile = s.piles.find((one) => one.id === to.pile);
    if (!pile) return { yes: false, why: "gone" };
    // ЗАКРЫТАЯ ПРИЁМКА И ПЕЧАТЬ — не про игру, а про саму стопку: их ставит человек, и действуют они
    // на всех одинаково.
    if (pile.shut) return { yes: false, why: "locked" };
    if (load === "pile" && pile.seal) return { yes: false, why: "locked" };
    return byDesk(s, by, load, to, desk, undefined);
  }

  const chair = s.chairs.find((one) => one.id === to.chair);
  if (!chair) return { yes: false, why: "gone" };
  // ЗАМОК И ОТКЛОНЕНИЕ ЧУЖОЙ РУКИ — тем же разбором, каким ответит стол (`access.ts`).
  const seat = may("hand.drop", {
    granted: s.rights,
    mine: chair.owner === by,
    locks: { lock: chair.lock, reject: chair.reject },
  });
  if (!allowed(seat)) return { yes: false, why: seat === true ? "" : seat.no };
  return byDesk(s, by, load, to, desk, chair);
}

/** Слово рода стола: он единственный знает, что эта игра считает охапкой и кому она позволена. */
function byDesk(s: Snapshot, by: string, load: Load, to: Where, desk: DeskRules, chair: Chair | undefined): Landing {
  const croupier = (id: string) => s.chairs.find((one) => one.id === id)?.croupier === true;
  const verdict = desk.says(
    { face: () => undefined, pile: () => [], hand: () => [], admin: () => false, croupier },
    to.in === "hand" ? "hand.drop" : "pile.drop",
    { by, at: to, ...(load === "pile" ? { whole: true as const } : {}), ...(chair ? { chair: chair.id } : {}) },
  );
  return allowed(verdict) ? пусто : { yes: false, why: verdict === true ? "" : verdict.no };
}
