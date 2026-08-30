// @vitest-environment jsdom

// THE CANVAS'S OWN TOOLBAR — and the one law it broke, which cost the dashcam its whole point.

import { describe, expect, it } from "vitest";
import { sceneToolbar, type ToolbarState } from "./sceneToolbar.js";
import { catalogText } from "../locales/catalog.js";

function bench(state: Partial<ToolbarState> = {}) {
  const pressed: string[] = [];
  const el = sceneToolbar(
    document,
    () => ({ text: catalogText("en"), hudUnit: "auto", bounds: false, grid: false, recording: true, marks: 0, ...state }),
    {
      onHudUnit: () => undefined,
      onBounds: () => pressed.push("bounds"),
      onGrid: () => pressed.push("grid"),
      onRecord: () => pressed.push("rec"),
      onMark: () => pressed.push("mark"),
      onExport: () => pressed.push("export"),
    },
  ).el;
  document.body.appendChild(el);
  const at = (attr: string) => el.querySelector<HTMLButtonElement>(`[${attr}]`)!;
  return { el, pressed, at };
}

/**
 * jsdom has no `PointerEvent`, and the shim is deliberately thin: a `MouseEvent` carrying the two
 * fields this wiring reads. Built by assignment rather than by a subclass — a class over an event
 * is a hierarchy, and this repository has none (`node.no-inheritance`).
 */
const Pointer = (type: string, init: { pointerId: number; pointerType?: string }): MouseEvent =>
  Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, detail: 0 }), {
    pointerId: init.pointerId,
    pointerType: init.pointerType ?? "touch",
  });

const touch = (b: HTMLElement, id: number): void => {
  for (const type of ["pointerdown", "pointerup"] as const) {
    b.dispatchEvent(Pointer(type, { pointerId: id }));
  }
};

describe("the scene's toolbar", () => {
  it("toolbar.answers-the-SECOND-finger — a click listener is deaf to one, by specification", () => {
    // The compatibility mouse events a touch synthesises — `click` among them — are fired only for
    // the PRIMARY pointer, and the primary pointer is the first finger still down. On a desk where
    // one hand rests on the pack, that is every button on this row gone silent: the reader could not
    // stamp the moment they were looking at, which is the one thing the dashcam exists for.
    const b = bench();
    touch(b.at("data-debug-mark"), 7); // not the primary finger: no click will follow
    touch(b.at("data-debug-export"), 9);
    touch(b.at("data-debug-rec"), 4);
    expect(b.pressed).toEqual(["mark", "export", "rec"]);
  });

  it("toolbar.a-press-fires-ONCE — the pointer and the click it synthesises are one press", () => {
    // A touch that is primary DOES produce a click behind its pointer events, so the two paths must
    // not both count. The compatibility click is refused at the down; the `click` path is left for
    // the keyboard, where `detail` is zero because no pointer produced it.
    const b = bench();
    const mark = b.at("data-debug-mark");
    const down = Pointer("pointerdown", { pointerId: 1 });
    mark.dispatchEvent(down);
    expect(down.defaultPrevented, "the synthesised click is refused at the source").toBe(true);
    mark.dispatchEvent(Pointer("pointerup", { pointerId: 1 }));
    mark.dispatchEvent(new MouseEvent("click", { detail: 1, bubbles: true, cancelable: true }));
    expect(b.pressed).toEqual(["mark"]);
    // AND THE KEYBOARD STILL PRESSES IT. Enter and Space arrive as a click with no pointer behind it.
    mark.dispatchEvent(new MouseEvent("click", { detail: 0, bubbles: true, cancelable: true }));
    expect(b.pressed).toEqual(["mark", "mark"]);
  });

  it("toolbar.a-finger-that-leaves-does-not-press — down here, up somewhere else", () => {
    const b = bench();
    const grid = b.at("data-debug-grid");
    grid.dispatchEvent(Pointer("pointerdown", { pointerId: 3 }));
    grid.dispatchEvent(Pointer("pointercancel", { pointerId: 3 }));
    grid.dispatchEvent(Pointer("pointerup", { pointerId: 3 }));
    expect(b.pressed).toEqual([]);
    // A different finger's release is not this finger's press either.
    grid.dispatchEvent(Pointer("pointerdown", { pointerId: 3 }));
    grid.dispatchEvent(Pointer("pointerup", { pointerId: 8 }));
    expect(b.pressed).toEqual([]);
  });

  it("toolbar.every-button-is-big-enough-for-a-thumb — the row is used on a phone", () => {
    // Nineteen pixels tall was what the type asked for and what nobody could hit: this row is read
    // and pressed on the same glass the desk is on, one-handed, while the other hand holds a pack.
    const b = bench();
    for (const attr of ["data-debug-bounds", "data-debug-grid", "data-debug-rec", "data-debug-mark", "data-debug-export"]) {
      expect(b.at(attr).style.minHeight, attr).toBe("34px");
    }
  });
});
