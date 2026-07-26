import { describe, it, expect } from "vitest";
import { buildBoardModel } from "./boardModel";
import type { BoardPreset } from "./boardPresets";

// Из пресета-данных → логическая модель: уникальные id фигур по слотам + карта id→лицо. Чисто.
describe("buildBoardModel", () => {
  it("генерит уникальные id по префиксу, переносит maxSize, копит faces", () => {
    const preset = { title: "", cols: 3, rows: 1, onOccupied: "merge", maxSize: 2, slots: { "0,0": ["A♠", "K♥"], "0,2": ["Q♦"] } } as BoardPreset;
    const { slots, faces } = buildBoardModel(preset, "bz0");
    expect(slots["0,0"]).toEqual({ members: ["bz0-0", "bz0-1"], maxSize: 2 });
    expect(slots["0,2"]).toEqual({ members: ["bz0-2"], maxSize: 2 });
    expect(faces).toEqual({ "bz0-0": "A♠", "bz0-1": "K♥", "bz0-2": "Q♦" });
  });
  it("без maxSize — undefined", () => {
    const preset = { title: "", cols: 1, rows: 1, onOccupied: "merge", slots: { "0,0": ["A♠"] } } as BoardPreset;
    expect(buildBoardModel(preset, "x").slots["0,0"]!.maxSize).toBeUndefined();
  });
});
