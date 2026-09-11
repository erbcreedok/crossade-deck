// WHAT THE HUB OFFERS — a list of data, and the one function each entry needs.
//
// The loader is a thunk holding a dynamic `import`, and that is the whole lazy-loading mechanism:
// the bundler cuts a chunk at every dynamic import, so a game's code is fetched when its tile is
// pressed and not before. Nothing here knows what a chunk is.
//
// The seam is `(container) => teardown`, which is exactly what an embedded game, an iframe and a
// separate page all look like from this side. The day a big game moves to its own URL, this entry
// changes and the shell does not.

/** What a game hands back when it starts: the way to stop it again, completely. */
export type Teardown = () => void;

export interface GameEntry {
  /** Opaque, and the value a tile carries so a press can say which game it meant. */
  readonly id: string;
  /** Already written, in the viewer's language — the kit never asks where a caption came from. */
  readonly label: string;
  /** Fetches the game's code and hands back its start function. Called on the press, never before. */
  readonly load: () => Promise<(container: HTMLElement) => Teardown>;
}

export const CATALOGUE: readonly GameEntry[] = [
  {
    id: "klondike",
    label: "Косынка",
    load: async () => (await import("@apps/klondike")).startSolitaire,
  },
  {
    // THE CARD TABLE IS ITS OWN PACKAGE NOW (`@apps/cards`) and comes in through the same door the
    // solitaire does: a container in, a teardown out. What the hub adds is WHERE it is being played
    // — its route, its strip, its beat (`hubHost`) — and nothing about how it is played.
    id: "cards",
    label: "Карты",
    load: async () => {
      const [{ startCards }, { hubHost }] = await Promise.all([import("@apps/cards"), import("../table/hubHost.js")]);
      return (container: HTMLElement) => startCards(container, { host: hubHost(container, "cards") });
    },
  },
  {
    id: "chess",
    label: "Шахматы",
    load: async () => (await import("../table/index.js")).startTable,
  },
  {
    id: "nardy",
    label: "Нарды",
    load: async () => (await import("../table/index.js")).startTable,
  },
];
