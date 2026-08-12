// THE PUBLIC API of @game-presets/cards — the one door a consumer comes through.
// A standalone imports from "@game-presets/cards", never a path into src. Grown per stage.
export { SUITS, suitByName, suitPath, SUIT_PATHS, type Suit, type SuitName, type SuitColor } from "./suits.js";
export { installClassicSkin, faceSurface, BACK_SURFACE } from "./skin.classic.js";
export { cards, deckByCardId, type CardsOptions } from "./cards.js";
export {
  crossade,
  CROSSADE_FIELDS,
  type CardKind,
  type CardSpec,
  type OrderedField,
  type Rank,
} from "./crossade.js";
