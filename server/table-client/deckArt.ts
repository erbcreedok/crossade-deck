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

/** Личный вид колоды — у каждого свой, на его устройстве: четыре цвета мастей и кириллица (Т В Д К). */
export interface DeckLook {
  fourColour: boolean;
  cyrillic: boolean;
}

export const PLAIN_LOOK: DeckLook = { fourColour: false, cyrillic: false };

/** Адрес картинки: лицо в наборе стола под личным видом (`classic-4c-cyr`) или рубашка стола. */
export function artUrl(rules: Pick<TableRules, "faces" | "back"> | undefined, face: Face | undefined, look: DeckLook = PLAIN_LOOK): string {
  const r = { faces: rules?.faces ?? DEFAULT_RULES.faces, back: rules?.back ?? DEFAULT_RULES.back };
  const set = [r.faces, look.fourColour ? "4c" : "", look.cyrillic ? "cyr" : ""].filter(Boolean).join("-");
  return face ? `/table/cards/${set}/${faceFile(face)}.webp` : `/table/cards/backs/${r.back}.webp`;
}

const LOOK_KEY = "crossade.table.deckLook";

/** Вид колоды с устройства; хранилища нет или запись битая — обычный. */
export function readLook(): DeckLook {
  try {
    const raw = JSON.parse(localStorage.getItem(LOOK_KEY) ?? "null") as Partial<DeckLook> | null;
    return { fourColour: raw?.fourColour === true, cyrillic: raw?.cyrillic === true };
  } catch {
    return { ...PLAIN_LOOK };
  }
}

export function writeLook(look: DeckLook): void {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(look));
  } catch {
    // Нет хранилища — вид живёт, пока открыт экран.
  }
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

export function deckArt(onReady: () => void, look: () => DeckLook = () => PLAIN_LOOK): DeckArt {
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
      const img = load(artUrl(rules, face, look()));
      return img.complete && img.naturalWidth > 0 ? img : undefined;
    },
    url: (rules, face) => artUrl(rules, face, look()),
    warm(rules) {
      const l = look();
      const key = `${rules?.faces}/${rules?.back}/${l.fourColour}/${l.cyrillic}`;
      if (key === warmed) return warming;
      warmed = key;
      const all = [load(artUrl(rules, undefined)), ...ALL.map((face) => load(artUrl(rules, face, l)))];
      warming = Promise.all(all.map(settled)).then(() => {});
      return warming;
    },
  };
}
