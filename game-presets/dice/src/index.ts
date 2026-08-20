// THE PUBLIC API of @game-presets/dice — the one door a consumer comes through.
// A standalone imports from "@game-presets/dice", never a path into src.
export { DIE_KINDS, DIE_SIZE, dieSpec, type DieKind, type DieSpec } from "./kinds.js";
export { faceSurface, installDiceSkin } from "./skin.classic.js";
export {
  die,
  flashFace,
  kindOf,
  outcomeOf,
  rollDie,
  showFace,
  throwDie,
  throwFromCarry,
  throwFromWall,
  wallsOf,
  type DieOptions,
  type Outcome,
  type RollDieOptions,
  type ThrowDieOptions,
  type ThrowFromCarryOptions,
  type ThrowFromWallOptions,
} from "./dice.js";
