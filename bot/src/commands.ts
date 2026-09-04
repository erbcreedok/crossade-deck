import { GAME_COMMANDS, type Game } from "./games.js";

/** Strips a `@botname` suffix Telegram appends to commands used in groups. */
function bareCommand(command: string): string {
  return command.split("@", 1)[0];
}

/** `/cards`, `/chess`, `/nardy` → the game they name; anything else → `undefined`. */
export function gameOfCommand(command: string): Game | undefined {
  return GAME_COMMANDS[bareCommand(command).replace(/^\//, "")];
}

/** `/new cards` → the named game; a bare `/new` or an unknown name → `undefined`. */
export function gameOfNewArg(arg: string | undefined): Game | undefined {
  if (!arg) return undefined;
  return GAME_COMMANDS[arg.trim().toLowerCase()];
}
