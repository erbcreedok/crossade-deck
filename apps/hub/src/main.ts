/// <reference types="vite/client" />
import { holdThePage } from "game-kit";
import { afterPaint } from "./hub/beat.js";
import { startHub } from "./hub/shell.js";
import { goTo, routeOf } from "./hub/route.js";
import { serverUrl } from "@crossade/wire";
import { isTelegramWebview } from "./telegram.js";
import { takeOverHere } from "./home/transfer.js";

const chrome = document.querySelector<HTMLElement>("#chrome");
const stage = document.querySelector<HTMLElement>("#stage");
const shell = document.querySelector<HTMLElement>("#shell");

/**
 * The Mini App is not registered in BotFather yet, so a player who taps the bot's plain link
 * inside Telegram lands in its webview, not a real browser — smaller viewport, no address bar,
 * none of the browser's own gestures. `openLink` is Telegram's own escape hatch out of that view.
 */
function wireTelegramBanner(): void {
  const webApp = (globalThis as any).Telegram?.WebApp;
  if (!isTelegramWebview(webApp, navigator.userAgent)) return;
  shell?.setAttribute("data-telegram", "1");
  document.querySelector<HTMLButtonElement>("#tg-banner-open")?.addEventListener("click", () => {
    webApp?.openLink(location.href);
  });
}
wireTelegramBanner();
// THE PAGE IS THE GAME'S TOO. A canvas comes held by `mount`; the document around it does not,
// and on a phone that document is where the damage is: a pull at the left edge navigates BACK out
// of the game, a pull downwards rubber-bands it (and inside a Telegram webview, closes it), a
// double tap zooms, a long press raises a loupe over the card being held. Said once, here, before
// anything is mounted — the kit never says it on a consumer's behalf, because a page of prose
// wants none of this.
holdThePage();

/**
 * A Mini App opened from a table's own link (`t.me/bot?startapp=CODE`) carries the code in
 * `start_param`, not in the URL — Telegram controls the address bar, the bot only gets to pass
 * this one string. Resolved to a game with the same lookup a pasted `#chess?room=CODE` link would
 * use, and written to the route BEFORE the hub boots, so it opens the table directly and never
 * shows the shelf first.
 */
async function openStartParamTable(): Promise<void> {
  const code = (globalThis as any).Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (typeof code !== "string" || code.length === 0 || routeOf()) return;
  try {
    const res = await fetch(`${serverUrl()}/rooms/by-code/${encodeURIComponent(code)}`);
    if (!res.ok) return;
    const { game } = (await res.json()) as { game?: string };
    if (game) goTo(game, "replace", code);
  } catch {
    // No server, no code, no game — the shelf is still there to fall back on.
  }
}

/**
 * HOW LONG THE CROSS IS SHOWN AT THE VERY LEAST, in ms.
 *
 * A warm cache boots this page in about two hundred milliseconds, and a screen that appears and
 * disappears inside that reads as a flicker — a fault, not a greeting. The floor is not a delay
 * added to the load: it is only ever waited out when the load beat it, and a boot that takes longer
 * simply keeps the line running.
 */
const BOOT_LEAST_MS = 400;

/**
 * TAKE THE CROSS DOWN — once the shelf is actually on the glass, and never before.
 *
 * ON A PAINTED FRAME (`afterPaint`), which is why the wait is asked for there and not here: the
 * hub names `requestAnimationFrame` in exactly one file, and a second caller "just this once" is
 * how a page ends up with frame loops nobody can find (`hub.one-clock`).
 */
function raiseBoot(): void {
  const boot = document.querySelector<HTMLElement>("#boot");
  if (!boot) return;
  afterPaint(() => {
    // SINCE THE PAGE STARTED, not since this function was reached: `performance.now()` counts from
    // the navigation, which is the moment the player actually saw the cross. By the time this
    // module runs it has already been up for however long the fetch took, and that time counts
    // towards the floor — the floor is about what was seen, not about what was waited for.
    const waited = performance.now();
    setTimeout(() => {
      boot.classList.add("gone");
      // Removed after the fade rather than instead of it — and removed, not hidden: it sits over
      // the whole page, and a transparent sheet left there would eat every press for ever.
      setTimeout(() => boot.remove(), 260);
    }, Math.max(0, BOOT_LEAST_MS - waited));
  });
}

// NOT A TOP-LEVEL AWAIT: the hub's build targets the phones it is for (safari14 among them), and
// a module that awaits at its top level does not load there at all. The boot waits inside a
// promise instead, which is the same order of events with a wider set of browsers.
let stop: (() => void) | undefined;
// ССЫЛКА ПЕРЕНОСА СРАБАТЫВАЕТ ДО ВСЕГО ОСТАЛЬНОГО. Хаб заводит гостя при первом же заходе
// (`ensureAccount`), и перенос, случившийся после, оставил бы на экране двух разных людей: гостя в
// углу и себя — в хранилище. Адрес чистится там же, внутри.
void takeOverHere()
  .then(() => openStartParamTable())
  .then(() => {
    stop = chrome && stage ? startHub(chrome, stage) : undefined;
    raiseBoot();
  });

// Dev only: tear the previous hub down before a hot update mounts the next. Without it every edit
// STACKS another canvas and its listeners on the page, the stale ones keep eating input, and the
// symptom reads as lag rather than as the leak it is. A production build has no `import.meta.hot`.
if (import.meta.hot) {
  import.meta.hot.dispose(() => stop?.());
}
