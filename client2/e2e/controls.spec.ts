import { test, expect, type Page } from "@playwright/test";

// Секция «Управление»: витрина ПУБЛИЧНОГО API (dispatch/flipCard/moveCard/setConcealed/
// setCardValue) + витрина «виджеты контролов» (Toggle/Stepper/Segmented). Раньше 0% покрыто.
test.describe("песочница — секция «Управление»", () => {
  test.use({ viewport: { width: 900, height: 6900 } }); // «Управление» сегодня последняя секция (после всех бордов) — высокий, чтобы видна без панорамирования

  interface Hooks {
    controls: {
      buttons: { cap: string; x: number; y: number }[];
      flipFaceUp: boolean | null;
      concealed: boolean | null;
      revealValue: string | null;
      moveCounts: { a: number; b: number } | null;
      widgets: { flag: boolean; level: number; mode: number; toggleAt: { x: number; y: number } | null; stepperMinusAt: { x: number; y: number } | null; stepperPlusAt: { x: number; y: number } | null; segmentedAt: { x: number; y: number }[] } | null;
    };
  }
  const hooks = (page: Page): Promise<Hooks> =>
    page.evaluate(() => (window as unknown as { __fd: { testHooks(): Hooks } }).__fd.testHooks());
  const btn = (h: Hooks, cap: string) => h.controls.buttons.find((b) => b.cap === cap)!;

  test.beforeEach(async ({ page }) => {
    await page.goto("/playground");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  });

  test("«перевернуть карту» меняет faceUp (flipCard через dispatch)", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    const h = await hooks(page);
    const before = h.controls.flipFaceUp;
    expect(before).not.toBeNull();
    const b = btn(h, "перевернуть карту");
    await page.mouse.click(box.x + b.x, box.y + b.y);
    await page.waitForTimeout(500); // флип-анимация
    const g = await hooks(page);
    expect(g.controls.flipFaceUp).toBe(!before);
  });

  test("«раскрыть / скрыть» переключает Concealable-состояние (setConcealed через dispatch)", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    const h = await hooks(page);
    expect(h.controls.concealed).toBe(true); // стартует скрытой
    const b = btn(h, "раскрыть / скрыть");
    await page.mouse.click(box.x + b.x, box.y + b.y);
    await page.waitForTimeout(200);
    let g = await hooks(page);
    expect(g.controls.concealed).toBe(false); // раскрыли
    await page.mouse.click(box.x + b.x, box.y + b.y);
    await page.waitForTimeout(200);
    g = await hooks(page);
    expect(g.controls.concealed).toBe(true); // снова скрыли
  });

  test("«узнать значение» меняет отображаемый номинал (setCardValue через dispatch)", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    const h = await hooks(page);
    expect(h.controls.revealValue).toBe(""); // придержано (маска)
    const b = btn(h, "узнать значение");
    await page.mouse.click(box.x + b.x, box.y + b.y);
    await page.waitForTimeout(200);
    let g = await hooks(page);
    expect(g.controls.revealValue).toBe("Q♦"); // раскрыли
    await page.mouse.click(box.x + b.x, box.y + b.y);
    await page.waitForTimeout(200);
    g = await hooks(page);
    expect(g.controls.revealValue).toBe(""); // снова придержали
  });

  test("«перенос из стопки в стопку» двигает карту между двумя демо-стопками", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    const h = await hooks(page);
    expect(h.controls.moveCounts).toEqual({ a: 5, b: 4 });
    const b = btn(h, "перенос из стопки в стопку");
    await page.mouse.click(box.x + b.x, box.y + b.y);
    await page.waitForTimeout(300);
    const g = await hooks(page);
    expect(g.controls.moveCounts).toEqual({ a: 4, b: 5 }); // одна карта уехала a→b
    await page.mouse.click(box.x + b.x, box.y + b.y);
    await page.waitForTimeout(300);
    const g2 = await hooks(page);
    expect(g2.controls.moveCounts).toEqual({ a: 5, b: 4 }); // и обратно b→a
  });

  test("виджеты контролов: Toggle «флаг» меняет состояние", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    const h = await hooks(page);
    const w = h.controls.widgets!;
    expect(w.flag).toBe(false);
    await page.mouse.click(box.x + w.toggleAt!.x, box.y + w.toggleAt!.y);
    await page.waitForTimeout(150);
    const g = await hooks(page);
    expect(g.controls.widgets!.flag).toBe(true);
  });

  test("виджеты контролов: Stepper «уровень» +/- меняет число в границах", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    let h = await hooks(page);
    const w = h.controls.widgets!;
    expect(w.level).toBe(3);
    await page.mouse.click(box.x + w.stepperPlusAt!.x, box.y + w.stepperPlusAt!.y);
    await page.waitForTimeout(150);
    h = await hooks(page);
    expect(h.controls.widgets!.level).toBe(4);
    await page.mouse.click(box.x + h.controls.widgets!.stepperMinusAt!.x, box.y + h.controls.widgets!.stepperMinusAt!.y);
    await page.waitForTimeout(150);
    h = await hooks(page);
    expect(h.controls.widgets!.level).toBe(3);
  });

  test("виджеты контролов: Segmented «режим» переключает выбранный вариант (a/b/c)", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    let h = await hooks(page);
    expect(h.controls.widgets!.mode).toBe(0);
    const segB = h.controls.widgets!.segmentedAt[1]!; // "b"
    await page.mouse.click(box.x + segB.x, box.y + segB.y);
    await page.waitForTimeout(150);
    h = await hooks(page);
    expect(h.controls.widgets!.mode).toBe(1);
  });
});
