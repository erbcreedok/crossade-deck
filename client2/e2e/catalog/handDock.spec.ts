import { test, expect, type Page } from "@playwright/test";

// ДОК РУКИ ПО КРАЯМ (сторис Mechanics/Hand) — живой движок: вертикальная колонка и сетка это та
// же математика handDock со свёрнутыми осями, но КАК она выглядит и ловит палец — видно только в
// браузере. Дев-хук `__story` — идиома канваса (см. engine.spec.ts).

interface StoryLike {
  handHud: { screenPoses(): { id: string; x: number; y: number }[]; insertIndexAt(x: number, y: number): number };
  rt: { api: { byId: Map<string, { faceUp: boolean; body: { px: number; py: number } }>; contentToScreen(x: number, y: number): { x: number; y: number } } };
  testHooks(): { cards: Record<string, { slot: string | null }> };
}

declare global {
  interface Window {
    __story?: StoryLike;
  }
}

const open = async (page: Page, story: string): Promise<void> => {
  await page.goto(`/iframe.html?id=mechanics-hand--${story}&viewMode=story`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500); // сцена + раздача стори в руку
};

const poses = (page: Page): Promise<{ id: string; x: number; y: number }[]> =>
  page.evaluate(() => window.__story!.handHud.screenPoses().map((p) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y) })));

test.describe("док руки по краям", () => {
  test("right-column: колонка у правого края, лица вверх, стол уступил ширину", async ({ page }) => {
    await open(page, "right-column");
    const ps = await poses(page);
    expect(ps.length).toBe(4);
    expect(new Set(ps.map((p) => p.x)).size).toBe(1); // один X — колонка
    const vw = page.viewportSize()!.width;
    expect(ps[0]!.x).toBeGreaterThan(vw * 0.7); // у правого края
    expect(ps[0]!.y).toBeLessThan(ps[3]!.y); // порядок руки сверху вниз
    const faces = await page.evaluate(() => window.__story!.handHud.screenPoses().map((p) => window.__story!.rt.api.byId.get(p.id)!.faceUp));
    expect(faces).toEqual([true, true, true, true]);
  });

  test("grid-dock: ряды вглубь от края; дроп со стола ложится в показанный гэп первого ряда", async ({ page }) => {
    await open(page, "grid-dock");
    const base = await poses(page);
    const rows = [...new Set(base.map((p) => p.y))];
    expect(rows.length).toBeGreaterThan(1); // сетка, не строка
    const row0y = Math.max(...rows); // низ: ряд 0 у края
    const row0 = base.filter((p) => p.y === row0y);

    const top = await page.evaluate(() => {
      const s = window.__story!;
      const deck = Object.entries(s.testHooks().cards)
        .filter(([, c]) => c.slot === "board:0")
        .map(([id]) => id);
      const id = deck[deck.length - 1]!;
      const n = s.rt.api.byId.get(id)!;
      return { id, ...s.rt.api.contentToScreen(n.body.px, n.body.py) };
    });
    const gapX = (row0[1]!.x + row0[2]!.x) / 2;
    await page.mouse.move(top.x, top.y);
    await page.mouse.down();
    await page.mouse.move(gapX, row0y, { steps: 14 });
    await page.waitForTimeout(400);
    const idx = await page.evaluate(([x, y]) => window.__story!.handHud.insertIndexAt(x!, y!), [gapX, row0y]);
    await page.mouse.up();
    await page.waitForTimeout(900);
    const after = await poses(page);
    expect(after.map((p) => p.id).indexOf(top.id)).toBe(idx);
  });
});
