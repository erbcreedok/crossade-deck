// WHERE SOMEBODY ELSE'S FINGER IS, ON THIS GLASS.
//
// A far hand is drawn twice over: the PIECE it is carrying moves in the tree (the kit's own
// `follow`), and the FINGER itself is a dot on the glass — over the canvas, never on the desk,
// because it belongs to the screen and not to the felt.
//
// The anchor travels in the DESK's units, the same number on every screen, and is turned into
// pixels by the eye that is looking. Sent as pixels it would land wherever the sender's zoom
// happened to be, which is the one thing a shared pointer must not do.

import { t, type Paint, type Palette, type Transform, type Vec } from "game-kit";

/** A far hand's cursor, over the glass — the catalog's own `DOT` size. */
export const CURSOR_DOT = 18;

/**
 * WHICH `position` VALUES ALREADY HOLD AN ABSOLUTE CHILD. Everything but `static` does, and the
 * question has to be asked of the COMPUTED style, never of the inline one.
 *
 * A hub's `#stage` is `position:absolute; top:56px; …; bottom:0` in the page's own stylesheet, and
 * its inline `position` is empty — so a guard reading `element.style.position` finds nothing, writes
 * `relative`, and the inline rule beats the stylesheet: the region loses its `top`/`bottom` and
 * collapses out of the flow to the canvas's intrinsic 2:1, a glass 197px tall on an 800px phone.
 * The desk then opens fitted to that strip and reads as a coin on the felt.
 */
const POSITIONED = ["relative", "absolute", "fixed", "sticky"];

/** Does this container still need a `position` of its own before a dot may be pinned inside it? */
export function needsPositioning(position: string): boolean {
  return !POSITIONED.includes(position);
}

/**
 * WHERE A FAR HAND'S CURSOR SITS ON THIS GLASS, in the container's own pixels.
 *
 * `at` is the anchor in the DESK's units and `view` is THIS screen's camera, so the point is turned
 * into pixels by the eye that is looking, never by the one that sent it. The result is offset from
 * the container's top-left corner, which the canvas fills.
 */
export function dotAt(at: Vec, view: Transform): { readonly left: number; readonly top: number } {
  return { left: view.a * at.x + view.c * at.y + view.e, top: view.b * at.x + view.d * at.y + view.f };
}

export interface FarDots {
  /** Put this seat's dot at `at` as seen through `view` — or take it off the glass when either is gone. */
  show(seat: string, at: Vec | undefined, view: Transform | undefined): void;
  /** Every dot off the glass, for good. */
  stop(): void;
}

/**
 * THE DOTS, ONE PER FAR SEAT — made on first sight of that seat and kept, because a player whose
 * finger comes and goes is one dot shown and hidden, not a new element every frame.
 */
export function farDots(container: HTMLElement, ink: (seat: string) => Paint): FarDots {
  if (needsPositioning(getComputedStyle(container).position)) container.style.position = "relative";
  const dots = new Map<string, HTMLDivElement>();

  const dotFor = (seat: string): HTMLDivElement => {
    let dot = dots.get(seat);
    if (!dot) {
      dot = document.createElement("div");
      dot.style.cssText =
        `position:absolute;z-index:4;width:${CURSOR_DOT}px;height:${CURSOR_DOT}px;border-radius:50%;` +
        `pointer-events:none;display:none;transform:translate(-50%,-50%);` +
        // SEAT INKS ARE ALWAYS PALETTE TOKENS, the widened `Paint` return type just does not say so.
        `background:${t(ink(seat) as keyof Palette)};box-shadow:0 0 0 2px ${t("sunkBg")}`;
      container.appendChild(dot);
      dots.set(seat, dot);
    }
    return dot;
  };

  return {
    show(seat, at, view) {
      const dot = dotFor(seat);
      if (!at || !view) {
        dot.style.display = "none";
        return;
      }
      dot.style.display = "block";
      const { left, top } = dotAt(at, view);
      dot.style.left = `${left}px`;
      dot.style.top = `${top}px`;
    },
    stop() {
      for (const dot of dots.values()) dot.remove();
      dots.clear();
    },
  };
}
