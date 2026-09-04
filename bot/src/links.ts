import { InlineKeyboard } from "grammy";
import type { Game } from "./games.js";
import { GAMES } from "./games.js";

export type RoomInfo = { code: string; game: Game };

/** The table's address in the hub, per `apps/hub/src/hub/route.ts` (`placeOf`): game name "table", code as the `room` param. */
export function tableUrl(hubUrl: string, code: string): string {
  return `${hubUrl}/#table?room=${encodeURIComponent(code)}`;
}

/** Direct Mini App deep link Telegram will open from a group, where `web_app` buttons are not shown. */
export function groupAppUrl(botUsername: string, appName: string, code: string): string {
  return `https://t.me/${botUsername}/${appName}?startapp=${encodeURIComponent(code)}`;
}

function announce(room: RoomInfo): string {
  return `Стол «${GAMES[room.game]}», код ${room.code}`;
}

/** DM reply: `web_app` button opens the table as a Mini App inside Telegram, plus a plain link for the browser. */
export function dmMessage(hubUrl: string, room: RoomInfo): { text: string; keyboard: InlineKeyboard } {
  const url = tableUrl(hubUrl, room.code);
  const keyboard = new InlineKeyboard().webApp("Играть", url);
  return { text: `${announce(room)}\n${url}`, keyboard };
}

/**
 * Group reply: `web_app` buttons don't render in groups, so the button is a plain `url` to the
 * Mini App deep link (`https://t.me/<bot>/<app>?startapp=<code>`) when `appName` is configured in
 * BotFather; without it there is nothing Telegram-native to link to, so the button falls back to
 * the hub URL itself.
 */
export function groupMessage(
  hubUrl: string,
  room: RoomInfo,
  botUsername: string,
  appName: string | undefined,
): { text: string; keyboard: InlineKeyboard } {
  const hub = tableUrl(hubUrl, room.code);
  const buttonUrl = appName ? groupAppUrl(botUsername, appName, room.code) : hub;
  const keyboard = new InlineKeyboard().url("Играть", buttonUrl);
  return { text: `${announce(room)}\n${hub}`, keyboard };
}
