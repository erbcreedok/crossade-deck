// THE PUBLIC API of @game-presets/cards — the one door a consumer comes through.
// A standalone imports from "@game-presets/cards", never a path into src. Grown per stage.
export { SUITS, suitByName, suitPath, SUIT_PATHS, type Suit, type SuitName, type SuitColor } from "./suits.js";
export { installClassicSkin, faceSurface, BACK_SURFACE } from "./skin.classic.js";
export { installDeckSkin, installDeckBacks, deckFaceImage, deckFaceSurface, deckBackSurface, type DeckSource } from "./decks/skin.js";
export {
  DECK_STYLES,
  DECK_LAYOUTS,
  deckStyleId,
  deckStyleOf,
  type DeckStyle,
  type DeckLayout,
} from "./decks/style.js";
export { BACK_NAMES, type BackName } from "./decks/backs.js";
export { faceSvg as deckFaceSvg, type FaceArt } from "./decks/face.js";
export { backSvg as deckBackSvg } from "./decks/backs.js";
export { cards, deckByCardId, deckCards, deckCardsById, type CardsOptions, type DeckCardsOptions } from "./cards.js";
export { shuffled } from "./shuffle.js";
export {
  crossade,
  CROSSADE_FIELDS,
  type CardKind,
  type CardSpec,
  type OrderedField,
  type Rank,
} from "./crossade.js";
