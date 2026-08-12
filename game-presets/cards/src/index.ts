// THE PUBLIC API of @game-presets/cards — the one door a consumer comes through.
// A standalone imports from "@game-presets/cards", never a path into src. Grown per stage.
export { SUITS, suitByName, type Suit, type SuitName, type SuitColor } from "./suits.js";
export {
  crossade,
  CROSSADE_FIELDS,
  type CardKind,
  type CardSpec,
  type OrderedField,
  type Rank,
} from "./crossade.js";
