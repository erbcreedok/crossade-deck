import { describe, expect, it } from "vitest";
import { createPresenceHub } from "./presence";

describe("presence: лок «кто первый схватил»", () => {
  it("первый держит, второй получает отказ; после release элемент свободен", () => {
    const hub = createPresenceHub();
    expect(hub.grab("p1", "A♠")).toBe(true);
    expect(hub.grab("p2", "A♠")).toBe(false);
    expect(hub.heldBy("A♠")).toBe("p1");
    hub.release("p2", "A♠"); // чужой лок не снимается
    expect(hub.heldBy("A♠")).toBe("p1");
    hub.release("p1", "A♠");
    expect(hub.heldBy("A♠")).toBeNull();
    expect(hub.grab("p2", "A♠")).toBe(true);
  });

  it("повторный grab своего элемента не ломает лок; подписчик видит курсоры и захваты", () => {
    const hub = createPresenceHub();
    const seen: string[] = [];
    hub.onChange((v) => seen.push(`${Object.keys(v.held).length}:${Object.keys(v.cursors).length}`));
    expect(hub.grab("p1", "A♠")).toBe(true);
    expect(hub.grab("p1", "A♠")).toBe(true);
    hub.cursor("ghost", { x: 10, y: 20 });
    expect(hub.view().cursors["ghost"]).toEqual({ x: 10, y: 20 });
    hub.cursor("ghost", null);
    expect(hub.view().cursors["ghost"]).toBeUndefined();
    expect(seen.length).toBeGreaterThanOrEqual(4);
  });
});

it("драг-стрим: точка в view.drags, null убирает — карту дальше ведёт снимок", () => {
  const hub = createPresenceHub();
  const seen: unknown[] = [];
  hub.onChange((v) => seen.push(v.drags));
  hub.drag("u1", "A♠", { x: 10, y: 20 });
  expect(hub.view().drags).toEqual({ u1: { el: "A♠", at: { x: 10, y: 20 } } });
  hub.drag("u1", "A♠", null);
  expect(hub.view().drags).toEqual({});
  expect(seen).toHaveLength(2);
});
