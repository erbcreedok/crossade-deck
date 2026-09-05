import { InlineKeyboard } from "grammy";
import type { Game } from "./games.js";
import { GAMES } from "./games.js";

export type RoomInfo = { code: string; game: Game };

/** The table's address in the hub, per `apps/hub/src/hub/route.ts` (`placeOf`): game id, code as the `room` param. */
export function tableUrl(hubUrl: string, game: Game, code: string): string {
  return `${hubUrl}/#${encodeURIComponent(game)}?room=${encodeURIComponent(code)}`;
}

function announce(room: RoomInfo): string {
  return `Стол «${GAMES[room.game]}», код ${room.code}`;
}

/**
 * A Mini App is not registered in BotFather yet (`/newapp` is the owner's later call), so the
 * plain hub link is the primary, always-working path: `url` button plus the same link as text,
 * opens in any browser without Telegram's cooperation. The `web_app` button is a second, optional
 * row that only appears once `TELEGRAM_APP_NAME` is set — before that Telegram has nothing to open
 * it as. Same in DMs and groups; there is no `web_app`-only path left.
 */
export function roomMessage(
  hubUrl: string,
  room: RoomInfo,
  appName: string | undefined,
): { text: string; keyboard: InlineKeyboard } {
  const url = tableUrl(hubUrl, room.game, room.code);
  const keyboard = new InlineKeyboard().url("Играть", url);
  if (appName) keyboard.webApp("Играть в Mini App", url);
  return { text: `${announce(room)}\n${url}`, keyboard };
}
