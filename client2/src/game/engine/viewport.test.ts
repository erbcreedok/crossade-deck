import { describe, it, expect } from "vitest";
import { Viewport } from "./viewport";

// Хелпер: камера 400x600 экран, 1000x2000 контент (крупнее по обеим осям).
function vp() {
  const v = new Viewport(0.6, 2.6);
  v.setScreen(400, 600);
  v.setContent(1000, 2000);
  return v;
}

describe("Viewport", () => {
  it("screenToContent — обратное к x/y/zoom", () => {
    const v = vp();
    v.x = 30;
    v.y = -50;
    v.zoom = 2;
    expect(v.screenToContent(130, 50)).toEqual({ x: 50, y: 50 });
  });

  it("clamp: контент уже экрана по X — центрируем", () => {
    const v = new Viewport(0.6, 2.6);
    v.setScreen(400, 600);
    v.setContent(200, 2000); // уже по X, выше по Y
    v.x = 999;
    v.clamp();
    expect(v.x).toBe((400 - 200) / 2); // 100, по центру
  });

  it("clamp: контент ниже экрана по Y — прижимаем к верхнему отступу", () => {
    const v = new Viewport(0.6, 2.6, 24);
    v.setScreen(400, 600);
    v.setContent(1000, 300); // ниже экрана
    v.y = 999;
    v.clamp();
    expect(v.y).toBe(24);
  });

  it("clamp: крупный контент держится в границах (не уезжает за край)", () => {
    const v = vp();
    v.x = 500; // хотим уехать вправо за левый край
    v.clamp();
    expect(v.x).toBe(0); // максимум 0 (левый край)
    v.x = -9999;
    v.clamp();
    expect(v.x).toBe(400 - 1000); // W - cw, правый край
  });

  it("zoomAround: экранная точка остаётся на месте", () => {
    const v = vp();
    const before = v.screenToContent(200, 300);
    v.zoomAround(200, 300, 1.5);
    const after = v.screenToContent(200, 300);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("zoom клампится в [min,max]", () => {
    const v = vp();
    v.zoomAround(200, 300, 100);
    expect(v.zoom).toBe(2.6);
    v.zoomAround(200, 300, 0.001);
    expect(v.zoom).toBe(0.6);
  });

  it("setScrollX: 0 → левый край, 1 → правый", () => {
    const v = vp();
    v.setScrollX(0);
    expect(v.x).toBeCloseTo(0, 6);
    v.setScrollX(1);
    expect(v.x).toBe(400 - 1000); // -overflow
  });

  it("state: флаги scrollable по переполнению", () => {
    const v = vp();
    const s = v.state();
    expect(s.scrollableX).toBe(true);
    expect(s.scrollableY).toBe(true);
    expect(s.thumbX).toBeCloseTo(400 / 1000, 6);

    const fit = new Viewport(0.6, 2.6);
    fit.setScreen(400, 600);
    fit.setContent(300, 300);
    expect(fit.state().scrollableX).toBe(false);
    expect(fit.state().scrollableY).toBe(false);
  });
});
