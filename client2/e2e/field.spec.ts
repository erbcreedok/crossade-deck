import { test, expect, type Page } from "@playwright/test";

// ПОЛЕ (новая механика): динамический грид растёт под контент + закрытая стопка (тянешь верх).
test.describe("песочница — Поле", () => {
  test.use({ viewport: { width: 900, height: 5200 } });

  interface Hooks {
    boards: { title: string; figures: { id: string; key: string; x: number; y: number }[]; slots: { key: string; x: number; y: number }[] }[];
  }
  const hooks = (page: Page): Promise<Hooks> => page.evaluate(() => (window as unknown as { __fd: { testHooks(): Hooks } }).__fd.testHooks());
  const field = (h: Hooks) => h.boards.find((b) => b.title === "Поле")!;

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

  test("тянешь верх стопки в грид → карта в гриде, стопка -1, грид РАСТЁТ", async ({ page }) => {
    const h = await hooks(page);
    const f = field(h);
    const idx = h.boards.indexOf(f);
    expect(f.figures.filter((x) => x.key === "stack")).toHaveLength(6);
    const slotsBefore = f.slots.length; // stack + 0,0 = 2
    const stack = f.slots.find((s) => s.key === "stack")!;
    const cell = f.slots.find((s) => s.key === "0,0")!;

    await dragTo(page, stack, cell);
    await page.waitForTimeout(500);
    const g = await hooks(page);
    const gf = g.boards[idx]!;
    expect(gf.figures.filter((x) => x.key === "stack")).toHaveLength(5); // -1 из стопки
    expect(gf.figures.some((x) => x.key === "0,0")).toBe(true); // карта в гриде
    expect(gf.slots.length).toBeGreaterThan(slotsBefore); // грид вырос (новые фронтир-ячейки)
  });

  test("на карту класть нельзя — вторая карта в занятую ячейку возвращается в стопку", async ({ page }) => {
    let h = await hooks(page);
    let f = field(h);
    const idx = h.boards.indexOf(f);
    // первая карта в 0,0
    await dragTo(page, f.slots.find((s) => s.key === "stack")!, f.slots.find((s) => s.key === "0,0")!);
    await page.waitForTimeout(400);
    h = await hooks(page);
    f = h.boards[idx]!;
    const occupied = f.slots.find((s) => s.key === "0,0")!;
    const stackCount = f.figures.filter((x) => x.key === "stack").length; // 5
    // вторая карта на ту же занятую ячейку → отказ → назад в стопку
    await dragTo(page, f.slots.find((s) => s.key === "stack")!, occupied);
    await page.waitForTimeout(500);
    const g = h.boards[idx] ? (await hooks(page)).boards[idx]! : field(await hooks(page));
    expect(g.figures.filter((x) => x.key === "stack").length).toBe(stackCount); // стопка не изменилась
    expect(g.figures.filter((x) => x.key === "0,0").length).toBe(1); // в ячейке всё ещё одна
  });
});
