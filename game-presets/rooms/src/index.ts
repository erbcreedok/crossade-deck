// МОСТ МЕЖДУ ХАБОМ И ИГРОЙ — экран, на котором выбирают стол: список, поиск, создание.
//
// Он НИЧЕГО не знает ни про наш сервер, ни про игры: ему дают комнаты, кто смотрит и что ответил
// сервер, а он отдаёт три вещи — войти в комнату, создать такую, стол без комнаты. Поэтому он
// одинаково открывается из хаба и из игры, стоящей на своём собственном URL.

export { roomsBridge, type Bridge, type BridgeGame, type BridgeOptions } from "./bridge.js";
export {
  chipsOf,
  fits,
  MODE_MEANS,
  MODE_WORDS,
  NO_FILTERS,
  OPENNESS_MEANS,
  OPENNESS_WORDS,
  type Answer,
  type Filters,
  type Group,
  type Mode,
  type NewTable,
  type Openness,
  type Person,
  type Room,
  type Who,
} from "./rooms.js";
export { GROUPS } from "./screens.js";
export { SEATS_MAX, SEATS_MIN } from "./parts.js";
