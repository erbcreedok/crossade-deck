/** The one field `Telegram.WebApp` exposes that tells a webview apart from a script tag doing nothing. */
export type TelegramWebApp = { platform?: string };

/**
 * True inside Telegram's own webview — a Mini App is not registered yet, so a player who taps the
 * bot's plain link there still lands in the wrong shell (no native gestures, a smaller viewport).
 * `platform` is `"unknown"` when the script loaded outside Telegram; a bare user-agent check backs
 * it up for webviews that inject the script without setting it.
 */
export function isTelegramWebview(webApp: TelegramWebApp | undefined, userAgent: string): boolean {
  if (webApp?.platform && webApp.platform !== "unknown") return true;
  return /Telegram/.test(userAgent);
}
