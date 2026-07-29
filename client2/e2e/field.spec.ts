import { test, expect, type Page } from "@playwright/test";

// ПОЛЕ: закрытая стопка на 52 + flow-грид (карты пакуются по индексу: 1→1×1, 4→2×2…).
test.describe("песочница — Поле (flow-грид)", () => {
  test.use({ viewport: { width: 900, height: 5800 } });

  interface Hooks {
    field: {
      stack: number;
      grid: number;
      colsMin: number;
      colsMax: number | undefined;
      rowsMin: number;
      rowsMax: number | undefined;
      reorder: boolean;
      reorderToggleAt: { x: number; y: number } | null;
      steppers: { label: string; value: number; minusAt: { x: number; y: number }; plusAt: { x: number; y: number } }[];
      stackAt: { x: number; y: number };
      gridRect: { x: number; y: number; w: number; h: number };
      gridCards: { id: string; x: number; y: number }[];
    } | null;
  }
  const hooks = (page: Page): Promise<Hooks> => page.evaluate(() => (window as unknown as { __fd: { testHooks(): Hooks } }).__fd.testHooks());

  test.beforeEach(async ({ page }) => {
    await page.goto("/playground");
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

  test("минимум 3 колонки: 6 карт пакуются 3×2", async ({ page }) => {
    for (let i = 0; i < 6; i++) {
      const h = await hooks(page);
      await dragTo(page, h.field!.stackAt, gridMid(h));
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(500); // дать картам осесть по flow-позициям
    const h = await hooks(page);
    expect(h.field!.grid).toBe(6);
    // кластеризуем с допуском (пружина даёт суб-пиксельный джиттер): 3 колонки × 2 ряда
    const xs = new Set(h.field!.gridCards.map((c) => Math.round(c.x / 50)));
    const ys = new Set(h.field!.gridCards.map((c) => Math.round(c.y / 50)));
    expect(xs.size).toBe(3); // минимум 3 колонки
    expect(ys.size).toBe(2); // 2 ряда
  });

  test("параметры поля: мин 3 колонки, макс 4 строки, макс колонок без предела", async ({ page }) => {
    const h = await hooks(page);
    expect(h.field!.colsMin).toBe(3);
    expect(h.field!.rowsMax).toBe(4);
    expect(h.field!.colsMax).toBeUndefined(); // без предела → грид растёт вширь при упоре в строки
    expect(h.field!.rowsMin).toBe(1);
  });

  test("упор в 4 строки: грид растёт вширь, а не вниз", async ({ page }) => {
    for (let i = 0; i < 20; i++) {
      const h = await hooks(page);
      await dragTo(page, h.field!.stackAt, gridMid(h));
      await page.waitForTimeout(140);
    }
    await page.waitForTimeout(700); // дать flow-пружинам осесть
    const h = await hooks(page);
    expect(h.field!.grid).toBe(20);
    const ys = new Set(h.field!.gridCards.map((c) => Math.round(c.y / 50)));
    const xs = new Set(h.field!.gridCards.map((c) => Math.round(c.x / 50)));
    expect(ys.size).toBeLessThanOrEqual(4); // строк не больше 4
    expect(xs.size).toBeGreaterThan(4); // растёт колонками
  });

  // Положить n карт из стопки в грид (по центру).
  const fillGrid = async (page: Page, n: number) => {
    for (let i = 0; i < n; i++) {
      const h = await hooks(page);
      await dragTo(page, h.field!.stackAt, gridMid(h));
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(500);
  };

  test("реордер включён по умолчанию", async ({ page }) => {
    const h = await hooks(page);
    expect(h.field!.reorder).toBe(true);
    expect(h.field!.reorderToggleAt).not.toBeNull();
  });

  test("реордер: тянешь карту грида на место первой → она встаёт в начало", async ({ page }) => {
    await fillGrid(page, 4);
    let h = await hooks(page);
    expect(h.field!.grid).toBe(4);
    const before = h.field!.gridCards.map((c) => c.id);
    const last = h.field!.gridCards[3]!;
    const first = h.field!.gridCards[0]!;
    await dragTo(page, { x: last.x, y: last.y }, { x: first.x, y: first.y });
    await page.waitForTimeout(500);
    h = await hooks(page);
    const after = h.field!.gridCards.map((c) => c.id);
    expect(after[0]).toBe(before[3]); // переставилась в начало
    expect(after).not.toEqual(before);
  });

  test("призрачная карта: при наведении карты грида раздвигаются под дыру", async ({ page }) => {
    await fillGrid(page, 4);
    const box = (await page.locator("canvas").boundingBox())!;
    let h = await hooks(page);
    const rest = new Map(h.field!.gridCards.map((c) => [c.id, c]));
    // тащим карту из колоды и ЗАВИСАЕМ над гридом слева (не отпуская)
    await page.mouse.move(box.x + h.field!.stackAt.x, box.y + h.field!.stackAt.y);
    await page.mouse.down();
    await page.mouse.move(box.x + h.field!.gridRect.x + 70, box.y + h.field!.gridRect.y + 60, { steps: 14 });
    await page.waitForTimeout(450); // дать соседям раздвинуться
    h = await hooks(page);
    const moved = h.field!.gridCards.some((c) => {
      const r = rest.get(c.id)!;
      return Math.abs(c.x - r.x) > 25 || Math.abs(c.y - r.y) > 25;
    });
    await page.mouse.up();
    expect(moved).toBe(true); // хотя бы одна карта сдвинулась (открылась дыра)
  });

  test("BR1: тянешь карту в КОНЕЦ грида (за последнюю) → встаёт последней", async ({ page }) => {
    await fillGrid(page, 4);
    let h = await hooks(page);
    const before = h.field!.gridCards.map((c) => c.id);
    const c0 = h.field!.gridCards[0]!;
    const last = h.field!.gridCards[before.length - 1]!;
    const gr = h.field!.gridRect;
    // дроп в правый край строки последней карты — резервный слот → вставка В КОНЕЦ (append).
    await dragTo(page, { x: c0.x, y: c0.y }, { x: gr.x + gr.w - 12, y: last.y });
    await page.waitForTimeout(500);
    h = await hooks(page);
    const after = h.field!.gridCards.map((c) => c.id);
    expect(after[after.length - 1]).toBe(before[0]); // первая карта уехала в КОНЕЦ
    expect(after).not.toEqual(before);
  });

  test("BR2: реордер выключен → карты грида НЕ раздвигаются под свою карту", async ({ page }) => {
    await fillGrid(page, 4);
    const box = (await page.locator("canvas").boundingBox())!;
    let h = await hooks(page);
    await page.mouse.click(box.x + h.field!.reorderToggleAt!.x, box.y + h.field!.reorderToggleAt!.y); // выкл реордер
    await page.waitForTimeout(200);
    h = await hooks(page);
    expect(h.field!.reorder).toBe(false);
    const rest = new Map(h.field!.gridCards.map((c) => [c.id, c]));
    const dragged = h.field!.gridCards[3]!;
    const first = h.field!.gridCards[0]!;
    await page.mouse.move(box.x + dragged.x, box.y + dragged.y);
    await page.mouse.down();
    await page.mouse.move(box.x + first.x, box.y + first.y, { steps: 12 });
    await page.waitForTimeout(400);
    h = await hooks(page);
    const spread = h.field!.gridCards.some((c) => {
      if (c.id === dragged.id) return false;
      const r = rest.get(c.id)!;
      return Math.abs(c.x - r.x) > 20 || Math.abs(c.y - r.y) > 20;
    });
    await page.mouse.up();
    expect(spread).toBe(false); // реордер off → гэпа нет, соседи стоят
  });

  test("тоглер выключает реордер: порядок карт не меняется", async ({ page }) => {
    await fillGrid(page, 4);
    const box = (await page.locator("canvas").boundingBox())!;
    let h = await hooks(page);
    const t = h.field!.reorderToggleAt!;
    await page.mouse.click(box.x + t.x, box.y + t.y); // выключаем реордер
    await page.waitForTimeout(200);
    h = await hooks(page);
    expect(h.field!.reorder).toBe(false);
    const before = h.field!.gridCards.map((c) => c.id);
    const last = h.field!.gridCards[3]!;
    const first = h.field!.gridCards[0]!;
    await dragTo(page, { x: last.x, y: last.y }, { x: first.x, y: first.y });
    await page.waitForTimeout(500);
    h = await hooks(page);
    expect(h.field!.gridCards.map((c) => c.id)).toEqual(before); // порядок прежний
  });

  test("степпер «мин колонок»: клик + увеличивает значение", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    let h = await hooks(page);
    const s = h.field!.steppers.find((x) => x.label === "мин колонок")!;
    expect(s.value).toBe(3);
    await page.mouse.click(box.x + s.plusAt.x, box.y + s.plusAt.y);
    await page.waitForTimeout(150);
    h = await hooks(page);
    expect(h.field!.colsMin).toBe(4);
    expect(h.field!.steppers.find((x) => x.label === "мин колонок")!.value).toBe(4);
  });

  test("степпер «мин колонок»: клик + меняет фактическую паковку грида (4 карты → 4×1, не 3+1)", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    let h = await hooks(page);
    const s = h.field!.steppers.find((x) => x.label === "мин колонок")!;
    await page.mouse.click(box.x + s.plusAt.x, box.y + s.plusAt.y); // 3 → 4
    await page.waitForTimeout(150);
    await fillGrid(page, 4);
    await page.waitForTimeout(400);
    h = await hooks(page);
    const ys = new Set(h.field!.gridCards.map((c) => Math.round(c.y / 50)));
    expect(ys.size).toBe(1); // все 4 в один ряд — минимум колонок теперь 4
  });

  test("степпер «мин колонок»: клик − возвращает значение назад (упирается в min=1)", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    let h = await hooks(page);
    const s = h.field!.steppers.find((x) => x.label === "мин колонок")!;
    await page.mouse.click(box.x + s.minusAt.x, box.y + s.minusAt.y); // 3 → 2
    await page.waitForTimeout(150);
    h = await hooks(page);
    expect(h.field!.colsMin).toBe(2);
  });
});
