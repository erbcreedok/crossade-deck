// THE GLASS IS THE GAME'S, NOT THE BROWSER'S.
//
// Every browser puts its own gestures on top of any element, and on a desk drawn with a finger they
// are all wrong at once: a long press raises a loupe over the card being held, a double tap zooms
// the page instead of turning a card over, a drag that began on a piece paints a text selection
// across the whole screen, a pull at the left edge navigates BACK out of the game, a pull downwards
// rubber-bands the page — and inside a Telegram webview that same pull closes the app.
//
// None of it can be fixed by being careful in a handler: the browser decides before the handler is
// called, and `preventDefault` on a passive listener is ignored. It is decided by DECLARING what
// the element wants (`touch-action`, `user-select`, the two `-webkit-` ones no standard replaced)
// and by refusing the few events that are still offered.
//
// TWO SCOPES, and they are not the same decision. The GLASS is a canvas a game draws on: it never
// wants any of it, so `mount` takes it off without being asked. The PAGE is the document around it,
// and that is the consumer's call — a catalog page is mostly prose, and prose a reader cannot select
// is a page that has been broken to protect a canvas that was not in danger. So a standalone says
// `holdThePage()` in its entry, and nothing says it on the reader's behalf.

/** The mark a held canvas wears, and the sheet that answers it — one rule for every glass on the page. */
const GLASS = "data-gk-glass";

/**
 * The rules. They are a STYLESHEET and not inline styles for the `-webkit-` two: no standard
 * replaced them, so no CSSOM models them, and a runtime that sets them through the style object is
 * writing into a property some engines simply drop. A rule is text, and text survives.
 */
const GLASS_RULES = [
  `[${GLASS}] {`,
  "  touch-action: none;", // no double-tap zoom and no pan: the kit reads the fingers itself
  "  user-select: none; -webkit-user-select: none;",
  "  -webkit-touch-callout: none;", // the loupe and the "Copy / Look Up" bubble on a long press
  "  -webkit-tap-highlight-color: transparent;",
  "  overscroll-behavior: none;",
  "}",
].join("\n");

/** Put the sheet in this document, once. A second scene finds it there and adds nothing. */
function glassSheet(doc: Document): void {
  if (doc.head.querySelector(`style[${GLASS}-rules]`)) return;
  const style = doc.createElement("style");
  style.setAttribute(`${GLASS}-rules`, "");
  style.textContent = GLASS_RULES;
  doc.head.appendChild(style);
}

/** How close to a side edge a touch has to start to be the system's back/forward swipe, CSS px. */
const EDGE = 24;

/** A Telegram webview, as much of it as this file needs to know: the pull-down that closes the app. */
interface TelegramHost {
  readonly WebApp?: {
    readonly disableVerticalSwipes?: () => void;
    readonly enableVerticalSwipes?: () => void;
  };
}

function telegram(win: Window): TelegramHost["WebApp"] | undefined {
  return (win as unknown as { Telegram?: TelegramHost }).Telegram?.WebApp;
}

/**
 * TAKE THE NATIVE GESTURES OFF ONE ELEMENT — the canvas a game draws on. `mount` calls this for the
 * view it makes, so every scene in every consumer is already held; call it yourself only for a
 * surface the kit did not create. Returns the undo.
 */
export function holdTheGlass(view: HTMLElement): () => void {
  glassSheet(view.ownerDocument);
  view.setAttribute(GLASS, "");

  // What is still OFFERED rather than declared: the long-press menu, the selection a drag starts,
  // the zoom a double tap asks for, and Safari's own pinch.
  const refuse = (e: Event): void => e.preventDefault();
  const events = ["contextmenu", "selectstart", "dragstart", "dblclick", "gesturestart", "gesturechange"] as const;
  for (const name of events) view.addEventListener(name, refuse);
  return () => {
    for (const name of events) view.removeEventListener(name, refuse);
    view.removeAttribute(GLASS);
  };
}

/**
 * TAKE THEM OFF THE WHOLE PAGE — what a standalone game says once, in its entry, before anything is
 * mounted. The catalog does NOT: its pages are prose.
 *
 * Three things a canvas alone cannot answer: the page's own rubber-band (which in a Telegram webview
 * closes the app), the system swipe at a side edge (which navigates back OUT of the game), and the
 * pinch that zooms the document. The first is declared in one stylesheet this owns entirely, so the
 * undo is removing the node; the other two are refused as they arrive.
 */
export function holdThePage(doc: Document = document): () => void {
  const style = doc.createElement("style");
  style.setAttribute("data-gk-held", "");
  style.textContent = [
    "html, body {",
    "  margin: 0; height: 100%; overflow: hidden;",
    // The band and the pull-to-close: the page has nowhere to go, and says so.
    "  overscroll-behavior: none;",
    // `manipulation` and not `none`: the page keeps its taps (a button is still a button) and
    // loses only the double-tap zoom the game would otherwise fire on every quick pair of taps.
    "  touch-action: manipulation;",
    "  user-select: none; -webkit-user-select: none;",
    "  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;",
    "}",
    // Fixed, so there is no viewport to drag at all — the one thing that stops a webview reading a
    // downward pull as "the reader wants out".
    "body { position: fixed; inset: 0; }",
  ].join("\n");
  doc.head.appendChild(style);

  const win = doc.defaultView;
  const onTouchStart = (e: Event): void => {
    const touches = (e as unknown as { touches?: ArrayLike<{ clientX: number }> }).touches;
    if (!touches || touches.length !== 1 || !win) return;
    const x = touches[0]!.clientX;
    // The system's back/forward swipe lives in a strip at each side, and it is claimed on the very
    // first touch — refusing it later is too late.
    if (x <= EDGE || x >= win.innerWidth - EDGE) e.preventDefault();
  };
  const onTouchMove = (e: Event): void => {
    const touches = (e as unknown as { touches?: ArrayLike<unknown> }).touches;
    if (touches && touches.length > 1) e.preventDefault(); // a two-finger pinch zooms the document
  };
  const refuse = (e: Event): void => e.preventDefault();
  doc.addEventListener("touchstart", onTouchStart, { passive: false });
  doc.addEventListener("touchmove", onTouchMove, { passive: false });
  doc.addEventListener("gesturestart", refuse);

  // A Telegram webview closes on a downward pull of its own accord, above and beyond the page's
  // band — it has a word for that, and the feature test is the whole of the integration.
  const tg = win ? telegram(win) : undefined;
  tg?.disableVerticalSwipes?.();

  return () => {
    style.remove();
    doc.removeEventListener("touchstart", onTouchStart);
    doc.removeEventListener("touchmove", onTouchMove);
    doc.removeEventListener("gesturestart", refuse);
    tg?.enableVerticalSwipes?.();
  };
}
