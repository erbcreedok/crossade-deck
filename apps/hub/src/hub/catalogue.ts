// WHAT THE HUB OFFERS — a list of data, and the one function each entry needs.
//
// The loader is a thunk holding a dynamic `import`, and that is the whole lazy-loading mechanism:
// the bundler cuts a chunk at every dynamic import, so a game's code is fetched when its tile is
// pressed and not before. Nothing here knows what a chunk is.
//
// The seam is `(container) => teardown`, which is exactly what an embedded game, an iframe and a
// separate page all look like from this side. EVERY GAME ON THIS SHELF IS ITS OWN PACKAGE and is
// already reachable at its own URL, so this file is the only place in the hub that names one.
//
// A TABLE GAME NEEDS ONE THING MORE than a patience: WHERE it is being played (`hubHost` — the
// hub's route, its strip, its beat). That is the only difference, and it is four lines per entry
// rather than a branch anywhere else.

/** What a game hands back when it starts: the way to stop it again, completely. */
export type Teardown = () => void;

/**
 * WHAT THE SHELF TELLS EVERY GAME IT STARTS, and the whole of it: that there is a way out of here
 * and where it leads. The strip along the top is the game's own (`@game-presets/tophud`) and stands
 * in a game opened at its own URL too — where nobody hands in one of these, and the strip has no
 * way out on it.
 */
export interface ShellDoor {
  readonly exit: TopHudExit;
  /** Сесть не вышло. Стол закрылся — не то же самое, что сеть моргнула, и говорится по-разному. */
  readonly lost?: ((why: "closed" | "offline") => void) | undefined;
}

import type { TopHudExit } from "@game-presets/tophud";

export interface GameEntry {
  /** Opaque, and the value a tile carries so a press can say which game it meant. */
  readonly id: string;
  /** Already written, in the viewer's language — the kit never asks where a caption came from. */
  readonly label: string;
  /**
   * WHAT THE LOADING SCREEN SAYS, and not the tile's own caption: "Загружаю косынку", not
   * "Косынка". A shelf NAMES a thing and a wait names an ACTION — and Russian declines the noun to
   * do it, which is why this is written out per game rather than glued together from the label.
   */
  readonly loading: string;
  /**
   * ЗНАК ИГРЫ — то, чем она помечена в строке стола. Одна фигура, а не картинка: строка списка
   * узнаётся боковым зрением, и плитка с веером карт в ней была бы вдвое выше самой строки.
   */
  readonly sign?: string;
  /**
   * WHETHER THIS GAME IS PLAYED AT A TABLE WITH OTHER PEOPLE. A press on one of these asks WHICH
   * table first — a patience has nobody to ask about.
   */
  readonly atTable?: boolean;
  /** Fetches the game's code and hands back its start function. Called on the press, never before. */
  readonly load: () => Promise<(container: HTMLElement, door: ShellDoor) => Teardown>;
}

/**
 * A GAME PLAYED AT A TABLE, wired to the hub's own host. One line per game instead of the ten
 * `if (game === …)` this shelf used to answer with.
 */
function tableGame(
  id: string,
  load: () => Promise<(container: HTMLElement, o: { host: never }) => Teardown>,
  o: {
    /**
     * СТУЛЬЯ ЭТОЙ ИГРЫ НАЗНАЧАЕТ СТОЛ, А НЕ ПРАВИЛО. У карт их столько, сколько поставили за стол;
     * у шахмат и нард всегда два, и спрашивать об этом комнату незачем — за доской не бывает
     * третьего места, сколько бы народу в комнату ни набилось.
     */
    readonly chairsFromRoom?: boolean;
  } = {},
): GameEntry["load"] {
  return async () => {
    const [start, { hubHost }] = await Promise.all([load(), import("../table/hubHost.js")]);
    return (container: HTMLElement, door: ShellDoor) => {
      const host = hubHost(container, id, door.exit, door.lost);
      const code = host.room();
      if (!o.chairsFromRoom || !code) return start(container, { host: host as never });
      // СПРАШИВАЕТСЯ ПОКА ГРУЗИТСЯ, а не после: стол, поднятый на двух стульях и переставленный на
      // шесть секундой позже, — это две разные картинки подряд и заново собранная камера.
      let stop: Teardown | undefined;
      let dropped = false;
      void import("@crossade/wire")
        .then(({ peekRoom }) => peekRoom(code))
        .then((card) => {
          if (dropped) return;
          stop = start(container, { host: host as never, chairs: card?.chairs ?? undefined } as never);
        });
      return () => {
        dropped = true;
        stop?.();
      };
    };
  };
}

export const CATALOGUE: readonly GameEntry[] = [
  {
    id: "klondike",
    label: "Косынка",
    loading: "Загружаю косынку",
    // A PATIENCE IS NOT PLAYED AT A DESK, so it has no host to be handed one through — and it wears
    // the same strip as the rest, told the same one thing.
    load: async () => {
      const start = (await import("@apps/klondike")).startSolitaire;
      return (container: HTMLElement, door: ShellDoor) => start(container, { exit: door.exit });
    },
  },
  {
    id: "cards",
    label: "Карты",
    loading: "Загружаю карты",
    sign: "\u2660",
    atTable: true,
    load: tableGame("cards", async () => (await import("@apps/cards")).startCards as never, { chairsFromRoom: true }),
  },
  {
    id: "chess",
    label: "Шахматы",
    loading: "Загружаю шахматы",
    sign: "\u265e",
    atTable: true,
    load: tableGame("chess", async () => (await import("@apps/chess")).startChess as never),
  },
  {
    id: "nardy",
    label: "Нарды",
    loading: "Загружаю нарды",
    sign: "\u2684",
    atTable: true,
    load: tableGame("nardy", async () => (await import("@apps/nardy")).startNardy as never),
  },
];
