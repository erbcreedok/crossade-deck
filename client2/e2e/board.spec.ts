import { test, expect, type Page } from "@playwright/test";

// Игровая зона (борд): фигуры-карты в слотах, драг между слотами (BoardZone.dropAt), фигуры
// заперты в рамке (clamp). Логический слот фигуры берём из хука (boardFigures[].key).
test.describe("песочница — игровая зона (борд)", () => {
  test.use({ viewport: { width: 900, height: 3200 } }); // высокий — виден и нижний select-борд

  interface Hooks {
    boardFigures: { id: string; key: string; x: number; y: number }[];
    boardSlots: { key: string; x: number; y: number }[];
    selMode: boolean;
    selection: string[];
    selButtons: { label: string; x: number; y: number }[];
    selFigures: { id: string; x: number; y: number }[];
    boards: { figures: { id: string; key: string; x: number; y: number }[]; slots: { key: string; x: number; y: number }[] }[];
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
    const a = h.boardFigures[0]!; // первая фигура первого борда
    const occupied = new Set(h.boardFigures.map((f) => f.key));
    const empty = h.boardSlots.find((s) => !occupied.has(s.key))!; // первый свободный слот
    expect(empty).toBeTruthy();
    await dragTo(page, a, empty);
    await page.waitForTimeout(500);
    const g = await hooks(page);
    expect(fig(g, a.id).key).toBe(empty.key); // переехала
  });

  test("фигура заперта в рамке — клампится, не убегает за край", async ({ page }) => {
    const h = await hooks(page);
    const a = h.boardFigures[0]!;
    const rightmost = Math.max(...h.boardSlots.map((s) => s.x));
    await dragTo(page, a, { x: a.x + 4000, y: a.y }, true); // тянем далеко вправо и держим
    const g = await hooks(page);
    await page.mouse.up();
    expect(g.draggingId).toBe(a.id);
    expect(fig(g, a.id).x).toBeLessThan(rightmost + h.cardW); // прижата к рамке, не на +4000
  });

  // Изолированный мультиселект (selection.ts).
  const clickAt = async (page: Page, p: { x: number; y: number }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.click(box.x + p.x, box.y + p.y);
  };
  const btn = (h: Hooks, label: string) => h.selButtons.find((b) => b.label === label)!;

  test("выделение: вход в режим, тап-выбор (тоггл), снять", async ({ page }) => {
    let h = await hooks(page);
    expect(h.selMode).toBe(false);
    await clickAt(page, btn(h, "выделение")); // вход в режим
    h = await hooks(page);
    expect(h.selMode).toBe(true);

    await clickAt(page, h.selFigures[0]!); // выбрать первую
    await clickAt(page, h.selFigures[1]!); // и вторую
    h = await hooks(page);
    expect(h.selection.sort()).toEqual([h.selFigures[0]!.id, h.selFigures[1]!.id].sort());

    await clickAt(page, h.selFigures[0]!); // тоггл первой — снять
    h = await hooks(page);
    expect(h.selection).toEqual([h.selFigures[1]!.id]);

    await clickAt(page, btn(h, "снять"));
    h = await hooks(page);
    expect(h.selection).toEqual([]); // набор пуст
    expect(h.selMode).toBe(true); // но режим остался
  });

  test("value-правило (цвет): красную нельзя на чёрную, можно на красную", async ({ page }) => {
    const h = await hooks(page);
    const idx = h.boards.length - 2; // rule-борд — предпоследний (последний — select-демо)
    const rb = h.boards[idx]!;
    // rule-борд: (0,0)=6♥ red, (0,1)=7♠ black, (0,2)=8♦ red
    const red = rb.figures.find((f) => f.key === "0,0")!;
    const blackSlot = rb.slots.find((s) => s.key === "0,1")!;

    await dragTo(page, red, blackSlot); // красную на чёрную — отказ
    await page.waitForTimeout(400);
    let g = await hooks(page);
    expect(g.boards[idx]!.figures.find((f) => f.id === red.id)!.key).toBe("0,0"); // осталась

    const redSlot = rb.slots.find((s) => s.key === "0,2")!;
    await dragTo(page, red, redSlot); // красную на красную — принято
    await page.waitForTimeout(400);
    g = await hooks(page);
    expect(g.boards[idx]!.figures.find((f) => f.id === red.id)!.key).toBe("0,2"); // переехала
  });

  test("ИЗОЛЯЦИЯ: в режиме выделения нельзя выбрать фигуру ЧУЖОЙ зоны", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, btn(h, "выделение"));
    // тап по фигуре первого борда (не selZone) — не должна попасть в набор
    await clickAt(page, { x: h.boardFigures[0]!.x, y: h.boardFigures[0]!.y });
    h = await hooks(page);
    expect(h.selection).toEqual([]); // чужая зона не выделяется
  });
});
