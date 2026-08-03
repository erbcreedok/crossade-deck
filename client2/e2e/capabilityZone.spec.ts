import { test, expect, type Page } from "@playwright/test";

// Слепая capability-gated зона (SELECTION-DESIGN §6, issue #73 — follow-up к #72). Демо-борд на
// /playground объявляет FieldZoneOpts.requiresCapability: "peekable": слот 0,0 несёт КАРТУ
// (Card реализует Peekable — peekReveal), слот 0,1 — ФИШКУ (Piece НЕ Peekable), слот 0,2 —
// пустая capability-gated цель. Дроп карты в 0,2 принимается (карта несёт способность целиком),
// дроп фишки в 0,2 отклоняется визуально — фишка остаётся на месте, зона её «не видит» (pass →
// resolveDropChain fallback false), в точности как в юнит-тестах boardZone.test.ts.
test.describe("песочница — слепая зона (requiresCapability, issue #73)", () => {
  test.use({ viewport: { width: 900, height: 7600 } }); // борды — последняя секция, нужен высокий вьюпорт

  interface Hooks {
    boards: { title: string; figures: { id: string; key: string; x: number; y: number }[]; slots: { key: string; x: number; y: number }[] }[];
  }
  const hooks = (page: Page): Promise<Hooks> =>
    page.evaluate(() => (window as unknown as { __fd: { testHooks(): Hooks } }).__fd.testHooks());

  test.beforeEach(async ({ page }) => {
    await page.goto("/playground");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  });

  const dragTo = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 14 });
    await page.mouse.up();
  };

  test("НЕспособный набор (фишка, без peekable) — дроп в слепую зону отклонён", async ({ page }) => {
    const h = await hooks(page);
    const zb = h.boards.find((b) => b.title.includes("слеп"))!;
    const chip = zb.figures.find((f) => f.key === "0,1")!;
    const target = zb.slots.find((s) => s.key === "0,2")!;
    await dragTo(page, chip, target);
    await page.waitForTimeout(400);
    const g = await hooks(page);
    const gzb = g.boards.find((b) => b.title.includes("слеп"))!;
    expect(gzb.figures.find((f) => f.id === chip.id)!.key).toBe("0,1"); // осталась на месте — зона слепа
  });

  test("способный набор (карта, peekable) — дроп в слепую зону принят", async ({ page }) => {
    const h = await hooks(page);
    const zb = h.boards.find((b) => b.title.includes("слеп"))!;
    const card = zb.figures.find((f) => f.key === "0,0")!;
    const target = zb.slots.find((s) => s.key === "0,2")!;
    await dragTo(page, card, target);
    await page.waitForTimeout(400);
    const g = await hooks(page);
    const gzb = g.boards.find((b) => b.title.includes("слеп"))!;
    expect(gzb.figures.find((f) => f.id === card.id)!.key).toBe("0,2"); // переехала — зона приняла
  });
});
