import { test, expect, type Page } from "@playwright/test";

// Игровая зона (борд): фигуры-карты в слотах, драг между слотами (BoardZone.dropAt), фигуры
// заперты в рамке (clamp). Логический слот фигуры берём из хука (boardFigures[].key).
test.describe("песочница — игровая зона (борд)", () => {
  test.use({ viewport: { width: 900, height: 1500 } });

  interface Hooks {
    boardFigures: { id: string; key: string; x: number; y: number }[];
    boardSlots: { key: string; x: number; y: number }[];
    cardW: number;
    draggingId: string | null;
  }
  const hooks = (page: Page): Promise<Hooks> =>
    page.evaluate(() => (window as unknown as { __fd: { testHooks(): Hooks } }).__fd.testHooks());
  const fig = (h: Hooks, id: string) => h.boardFigures.find((f) => f.id === id)!;

  test.beforeEach(async ({ page }) => {
    await page.goto("/free-desk");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  });

  const dragTo = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }, hold = false) => {
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 14 });
    if (!hold) await page.mouse.up();
  };

  test("фигура переезжает в пустой слот (логический key меняется)", async ({ page }) => {
    const h = await hooks(page);
    const a = fig(h, "bz-a");
    const occupied = new Set(h.boardFigures.map((f) => f.key));
    const empty = h.boardSlots.find((s) => !occupied.has(s.key))!; // первый свободный слот
    expect(empty).toBeTruthy();
    await dragTo(page, a, empty);
    await page.waitForTimeout(500);
    const g = await hooks(page);
    expect(fig(g, "bz-a").key).toBe(empty.key); // переехала
  });

  test("фигура заперта в рамке — клампится, не убегает за край", async ({ page }) => {
    const h = await hooks(page);
    const a = fig(h, "bz-a");
    const rightmost = Math.max(...h.boardSlots.map((s) => s.x));
    await dragTo(page, a, { x: a.x + 4000, y: a.y }, true); // тянем далеко вправо и держим
    const g = await hooks(page);
    await page.mouse.up();
    expect(g.draggingId).toBe("bz-a");
    expect(fig(g, "bz-a").x).toBeLessThan(rightmost + h.cardW); // прижата к рамке, не на +4000
  });
});
