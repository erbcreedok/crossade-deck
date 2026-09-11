// NOTHING IS DRAWN UNTIL THERE IS A PLACE TO DRAW IT FROM.
//
// WHICH SEAT THIS GLASS IS arrives from the room (`joinTable`'s welcome), and the desk is stood up
// before it does — a host hands its element back and the camera opens on the first real layout,
// which is faster than any round trip. So the first frame is drawn from the MIDDLE of the room,
// looking at the desk from nobody's side of it, and a second or two later the seat lands and the
// view is taken home: the table slides across the glass, under a chair that appears at the same
// moment. Owner: "стол по центру, потом стул появляется и камера прыгает".
//
// A camera that opened at the right place instead is not on the table: until the room has said,
// there IS no right place. So the desk is covered while it is still guessing, and the cover comes
// off on the frame that is already home — a beat of the hub's own felt, and then the table.

export interface Curtain {
  /** Take the cover off. Idempotent: every way the join can settle ends by calling it. */
  raise(): void;
  /** Whether the desk is still hidden — read by the wiring's own guard and by tests. */
  down(): boolean;
}

/**
 * Covers `over` with `paint` until something raises it.
 *
 * THE COLOUR IS THE CALLER'S and not this file's: the cover has to be the felt the page around the
 * region is already showing, and only the page knows what that is. A dark sheet of this module's
 * own choosing reads as a screen that FAILED rather than one still opening.
 */
export function curtain(over: HTMLElement, paint: string): Curtain {
  const sheet = document.createElement("div");
  // THE PAGE'S OWN FELT and not a dark sheet: the strip above the region goes on showing the page's
  // green, and a black rectangle under it reads as a screen that failed rather than one still
  // opening. ABOVE THE FAR CURSORS AND THE BANNER (`z-index` 4 and 5 in this stage): a dot drawn
  // for a player whose view arrived before this screen's own is exactly the news it exists to hold.
  sheet.style.cssText = `position:absolute;inset:0;z-index:6;pointer-events:none;background:${paint}`;
  over.appendChild(sheet);
  return {
    raise() {
      sheet.remove();
    },
    down: () => sheet.isConnected,
  };
}
