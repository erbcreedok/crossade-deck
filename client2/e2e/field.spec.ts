import { test, expect, type Page } from "@playwright/test";

// ПОЛЕ: закрытая стопка на 52 + flow-грид (карты пакуются по индексу: 1→1×1, 4→2×2…).
test.describe("песочница — Поле (flow-грид)", () => {
  test.use({ viewport: { width: 900, height: 5800 } });

  interface Hooks {
    field: { stack: number; grid: number; stackAt: { x: number; y: number }; gridRect: { x: number; y: number; w: number; h: number }; gridCards: { id: string; x: number; y: number }[] } | null;
  }
  const hooks = (page: Page): Promise<Hooks> => page.evaluate(() => (window as unknown as { __fd: { testHooks(): Hooks } }).__fd.testHooks());

  test.beforeEach(async ({ page }) => {
    await page.goto("/free-desk");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
  });

  const dragTo = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 14 });
    await page.mouse.up();
  };
  const gridMid = (h: Hooks) => ({ x: h.field!.gridRect.x + h.field!.gridRect.w / 2, y: h.field!.gridRect.y + h.field!.gridRect.h / 2 });

  test("52 в стопке; тянешь верх в грид → в гриде +1, в стопке -1", async ({ page }) => {
    let h = await hooks(page);
    expect(h.field!.stack).toBe(52);
    expect(h.field!.grid).toBe(0);
    await dragTo(page, h.field!.stackAt, gridMid(h));
    await page.waitForTimeout(500);
    h = await hooks(page);
    expect(h.field!.stack).toBe(51);
    expect(h.field!.grid).toBe(1);
  });

  test("кладёшь 4 карты → flow-грид пакует их 2×2 (2 колонки × 2 ряда)", async ({ page }) => {
    for (let i = 0; i < 4; i++) {
      const h = await hooks(page);
      await dragTo(page, h.field!.stackAt, gridMid(h));
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(500); // дать картам осесть по flow-позициям
    const h = await hooks(page);
    expect(h.field!.grid).toBe(4);
    // кластеризуем с допуском (пружина даёт суб-пиксельный джиттер): 2 колонки × 2 ряда
    const xs = new Set(h.field!.gridCards.map((c) => Math.round(c.x / 50)));
    const ys = new Set(h.field!.gridCards.map((c) => Math.round(c.y / 50)));
    expect(xs.size).toBe(2); // 2 колонки
    expect(ys.size).toBe(2); // 2 ряда
  });
});
