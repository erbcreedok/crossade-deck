// ЛИЦА И РУБАШКИ — готовые растры колоды (`game-presets/cards`, `decks/baked/`), которые сервер стола
// отдаёт по `/table/cards/…`. Какие именно — правило стола (`rules.faces`, `rules.back`), одно на всех.
//
// Картинка ещё не пришла — рисующий берёт `undefined` и рисует карту по-старому, а по приходу картинки
// экран перерисовывается (`onReady`).

import { DEFAULT_RULES, type Face, type TableRules } from "../src/table/contract.js";

const SUIT_FILE: Record<Face["suit"], string> = { s: "spade", h: "heart", d: "diamond", c: "club", r: "joker", b: "joker" };

/** Имя файла лица: `spade-A`, `heart-10`, `joker-red`. */
export function faceFile(face: Face): string {
  if (face.rank === "JK") return face.suit === "b" ? "joker-black" : "joker-red";
  return `${SUIT_FILE[face.suit]}-${face.rank}`;
}

/** Адрес картинки: лицо в наборе стола или его рубашка. */
export function artUrl(rules: Pick<TableRules, "faces" | "back"> | undefined, face: Face | undefined): string {
  const r = { faces: rules?.faces ?? DEFAULT_RULES.faces, back: rules?.back ?? DEFAULT_RULES.back };
  return face ? `/table/cards/${r.faces}/${faceFile(face)}.webp` : `/table/cards/backs/${r.back}.webp`;
}

export interface DeckArt {
  /** Картинка карты, если уже загружена. */
  image(rules: TableRules | undefined, face: Face | undefined): HTMLImageElement | undefined;
  /** Адрес для DOM-карты. */
  url(rules: TableRules | undefined, face: Face | undefined): string;
  /** Загрузить весь набор стола заранее: 54 лица и рубашку. Промис — когда все пришли (или не смогли). */
  warm(rules: TableRules | undefined): Promise<void>;
}

const ALL: Face[] = [
  ...(["s", "h", "d", "c"] as const).flatMap((suit) => ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].map((rank) => ({ suit, rank }))),
  { suit: "r", rank: "JK" },
  { suit: "b", rank: "JK" },
];

/** Картинка пришла или не смогла прийти — ждать её дальше нечего. */
export function settled(img: HTMLImageElement): Promise<void> {
  if (img.complete) return Promise.resolve();
  return new Promise((resolve) => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });
}

export function deckArt(onReady: () => void): DeckArt {
  const cache = new Map<string, HTMLImageElement>();
  let warmed = "";
  let warming: Promise<void> = Promise.resolve();
  const load = (src: string): HTMLImageElement => {
    let img = cache.get(src);
    if (!img) {
      img = new Image();
      img.decoding = "async";
      img.onload = () => onReady();
      img.src = src;
      cache.set(src, img);
    }
    return img;
  };
  return {
    image(rules, face) {
      const img = load(artUrl(rules, face));
      return img.complete && img.naturalWidth > 0 ? img : undefined;
    },
    url: artUrl,
    warm(rules) {
      const key = `${rules?.faces}/${rules?.back}`;
      if (key === warmed) return warming;
      warmed = key;
      const all = [load(artUrl(rules, undefined)), ...ALL.map((face) => load(artUrl(rules, face)))];
      warming = Promise.all(all.map(settled)).then(() => {});
      return warming;
    },
  };
}
