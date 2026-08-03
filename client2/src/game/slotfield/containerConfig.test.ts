import { describe, it, expect } from "vitest";
import { resolveConfig, DEFAULT_CONFIG } from "./containerConfig";

// Конфиг ЖИВЁТ в контейнере (глобально для его фигур): рубашка, мультиселект, сорт выделения,
// запертость в рамке, режимы захвата, onEmpty. resolveConfig мержит частичный поверх дефолта.
describe("containerConfig", () => {
  it("дефолт: мультиселект вкл, сорт по номиналу, фигуры заперты", () => {
    expect(DEFAULT_CONFIG.multiSelect).toBe(true);
    expect(DEFAULT_CONFIG.selectSort).toBe("rank"); // «мультиселект по дефолту сортирует по номиналу»
    expect(DEFAULT_CONFIG.bounded).toBe(true);
  });
  it("resolveConfig({}) = дефолт", () => {
    expect(resolveConfig({})).toEqual(DEFAULT_CONFIG);
  });
  it("частичный конфиг переопределяет только своё", () => {
    const c = resolveConfig({ multiSelect: false, back: "emerald" });
    expect(c.multiSelect).toBe(false);
    expect(c.back).toBe("emerald");
    expect(c.selectSort).toBe(DEFAULT_CONFIG.selectSort); // остальное — из дефолта
    expect(c.bounded).toBe(DEFAULT_CONFIG.bounded);
  });
});
