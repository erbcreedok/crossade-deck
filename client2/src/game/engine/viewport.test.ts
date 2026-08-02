import { describe, it, expect } from "vitest";
import { Viewport, wheelGoesToScene } from "./viewport";

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

  it("fling: малая скорость ниже порога не летит", () => {
    const v = vp();
    v.startFling(10, 10);
    expect(v.flinging).toBe(false);
  });

  it("fling двигает вид и со временем гаснет", () => {
    const v = vp();
    v.x = -300;
    v.startFling(-1000, 0);
    expect(v.flinging).toBe(true);
    const x0 = v.x;
    v.stepFling(0.016);
    expect(v.x).toBeLessThan(x0); // уехал влево
    let steps = 0;
    while (v.stepFling(0.016) && steps < 1000) steps++;
    expect(v.flinging).toBe(false); // остановился
  });

  it("fling в упор в край сразу гаснет", () => {
    const v = vp();
    v.x = 0; // правый край (max 0)
    v.startFling(1000, 0); // толкаем за край
    v.stepFling(0.016);
    expect(v.x).toBe(0);
    expect(v.flinging).toBe(false);
  });

  it("stopFling гасит инерцию", () => {
    const v = vp();
    v.startFling(1000, 0);
    v.stopFling();
    expect(v.flinging).toBe(false);
    expect(v.stepFling(0.016)).toBe(false);
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

// Витрина каталога кладёт содержимое ИНАЧЕ, чем песочница, и это не косметика: у песочницы
// вертикальная лента секций (её прижимают к верху), а у витрины раздел один и кадр принадлежит
// ему целиком — прижатый к верху, он оставлял под собой пустое поле в пол-экрана.
describe("Viewport: alignY", () => {
  const withAlign = (alignY: "center" | "top") => {
    const v = new Viewport(0.08, 4, 24, "center", 0, alignY);
    v.setScreen(400, 600);
    v.setContent(200, 300); // мельче экрана по обеим осям
    return v;
  };

  it("alignY: center — контент ниже экрана центрируется по вертикали", () => {
    const v = withAlign("center");
    v.y = 999;
    v.clamp();
    expect(v.y).toBe((600 - 300) / 2);
  });

  it("alignY: top (умолчание) — прижимаем к верхнему отступу, как было у песочницы", () => {
    const v = withAlign("top");
    v.y = 999;
    v.clamp();
    expect(v.y).toBe(24);
  });

  it("центрирование не отменяет клампа: контент ВЫШЕ экрана держится в границах", () => {
    const v = new Viewport(0.08, 4, 24, "center", 0, "center");
    v.setScreen(400, 600);
    v.setContent(200, 2000);
    v.y = 999;
    v.clamp();
    expect(v.y).toBe(0); // максимум — верхний край, ниже уезжать некуда
    v.y = -9999;
    v.clamp();
    expect(v.y).toBe(600 - 2000);
  });

  it("обе оси разом: узкий и низкий контент стоит по центру кадра", () => {
    const v = withAlign("center");
    v.clamp();
    expect(v.x).toBe((400 - 200) / 2);
    expect(v.y).toBe((600 - 300) / 2);
  });
});

// Колесо: сцена глотала его всегда, и страница под канвасом не скроллилась — а двигать было
// нечего. Со стороны это выглядело как зависший сайт, поэтому «есть ли куда двигать» —
// отдельный вопрос, на который камера обязана отвечать честно.
describe("Viewport: есть ли куда панорамировать", () => {
  it("контент влезает — двигать некуда по обеим осям", () => {
    const v = new Viewport(0.08, 4);
    v.setScreen(400, 600);
    v.setContent(300, 500);
    expect(v.overflowX).toBe(false);
    expect(v.overflowY).toBe(false);
  });

  it("переполнение считается В ТЕКУЩЕМ зуме, а не по исходному габариту", () => {
    const v = new Viewport(0.08, 4);
    v.setScreen(400, 600);
    v.setContent(800, 400); // шире экрана в масштабе 1:1
    expect(v.overflowX).toBe(true);
    v.setZoom(0.4); // ужали — влез
    expect(v.overflowX).toBe(false);
    v.setZoom(2); // приблизили — вылез и по высоте тоже
    expect(v.overflowX).toBe(true);
    expect(v.overflowY).toBe(true);
  });

  it("ровно по кадру — это НЕ переполнение: полпикселя допуска, иначе дребезг на дробном зуме", () => {
    const v = new Viewport(0.08, 4);
    v.setScreen(400, 600);
    v.setContent(400, 600);
    expect(v.overflowX).toBe(false);
    expect(v.overflowY).toBe(false);
  });
});

describe("кому достаётся колесо", () => {
  it("зум с модификатором забирает сцена всегда — он осмыслен и при вписанном контенте", () => {
    expect(wheelGoesToScene({ zoom: true, canPan: false, inDocument: true })).toBe(true);
  });

  it("внутри документа плоское колесо УХОДИТ СТРАНИЦЕ, даже когда сцене есть куда ехать", () => {
    // Иначе маленький канвас посреди текста съедает прокрутку, и это читается как зависший сайт.
    expect(wheelGoesToScene({ zoom: false, canPan: true, inDocument: true })).toBe(false);
  });

  it("в своём кадре сцена панорамирует — но только если есть куда", () => {
    expect(wheelGoesToScene({ zoom: false, canPan: true, inDocument: false })).toBe(true);
    expect(wheelGoesToScene({ zoom: false, canPan: false, inDocument: false })).toBe(false);
  });
});
