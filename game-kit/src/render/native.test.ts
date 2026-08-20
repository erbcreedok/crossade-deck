// @vitest-environment jsdom

// The native gestures, refused. jsdom has no touch and no loupe, but it HAS the declarations and
// the listeners — and those are the whole mechanism: what the element says it wants, and what it
// refuses when offered. The rest is the browser's to honour.

import { describe, expect, it } from "vitest";
import { Container, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { freeLayout } from "../core/atoms/layouts.js";
import { node } from "../core/node.js";
import { mount } from "./host.js";
import { holdThePage } from "./native.js";

/** An event of a name jsdom has no constructor for, carrying the fields the handler reads. */
function touch(name: string, xs: number[]): Event {
  const e = new Event(name, { cancelable: true, bubbles: true });
  Object.defineProperty(e, "touches", { value: xs.map((clientX) => ({ clientX })) });
  return e;
}

describe("the native gestures", () => {
  it("native.the-glass-refuses-the-page-its-gestures — a mounted canvas declares what it wants and refuses the rest", () => {
    resetLayouts();
    registerLayout("free", freeLayout);
    const box = document.createElement("div");
    document.body.appendChild(box);
    const host = mount(box, node("desk", Container({ layout: "free" })));
    const view = box.querySelector("canvas")!;
    // Declared: no zoom or pan the kit did not ask for, no selection, no loupe on a long press.
    expect(view.hasAttribute("data-gk-glass")).toBe(true);
    const rules = document.head.querySelector("style[data-gk-glass-rules]")?.textContent ?? "";
    for (const said of ["touch-action: none", "user-select: none", "-webkit-touch-callout: none", "overscroll-behavior: none"]) {
      expect(rules, said).toContain(said);
    }
    // Refused: everything still offered as an event.
    for (const name of ["contextmenu", "selectstart", "dragstart", "dblclick", "gesturestart"]) {
      const e = new Event(name, { cancelable: true });
      view.dispatchEvent(e);
      expect(e.defaultPrevented, name).toBe(true);
    }
    // ...and it lets go with the host: a scene that was taken down leaves no handlers behind.
    host.unmount();
    expect(view.hasAttribute("data-gk-glass")).toBe(false);
    const after = new Event("contextmenu", { cancelable: true });
    view.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it("native.the-page-lets-go-of-the-edge-and-the-pinch — the swipe out of the game and the zoom, and the undo puts both back", () => {
    let refused = 0;
    let restored = 0;
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: { disableVerticalSwipes: () => { refused++; }, enableVerticalSwipes: () => { restored++; } },
    };
    const undo = holdThePage(document);
    const sheet = document.head.querySelector("style[data-gk-held]");
    expect(sheet?.textContent).toContain("overscroll-behavior: none");
    expect(sheet?.textContent).toContain("user-select: none");
    expect(refused).toBe(1); // a Telegram webview closes on a downward pull unless told not to

    // A touch that starts in the side strip is the system's back swipe — the game keeps it.
    const edge = touch("touchstart", [4]);
    document.dispatchEvent(edge);
    expect(edge.defaultPrevented).toBe(true);
    // One that starts anywhere else is the game's own gesture and is left entirely alone.
    const middle = touch("touchstart", [Math.round(window.innerWidth / 2)]);
    document.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(false);
    // Two fingers moving is the document's pinch zoom; one finger is a drag and stays untouched.
    const pinch = touch("touchmove", [100, 240]);
    document.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);
    const drag = touch("touchmove", [100]);
    document.dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(false);

    undo();
    expect(document.head.querySelector("style[data-gk-held]")).toBeNull();
    expect(restored).toBe(1);
    const again = touch("touchstart", [4]);
    document.dispatchEvent(again);
    expect(again.defaultPrevented).toBe(false);
  });
});
