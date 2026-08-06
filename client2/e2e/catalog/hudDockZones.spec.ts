import { test, expect, type Page } from "@playwright/test";

// Док ЛЮБОЙ зоны (Mechanics/Hud Docks): pile-колода в области HUD — стопка рубашками (лицо —
// правило зоны, не дока), верхняя карта тащится на борд, дроп ложится сверху; переезд борд↔HUD
// живой (applySpec: сцена та же). Дев-хук `__story` — идиома канваса.

interface StoryLike {
  hud: { screenPoses(): { zone: string; id: string; x: number; y: number }[] };
  rt: { api: { byId: Map<string, { faceUp: boolean }> } };
  testHooks(): { cards: Record<string, { slot: string | null; x: number; y: number }> };
}

declare global {
  interface Window {
    __story?: StoryLike;
  }
}

const open = async (page: Page, args = ""): Promise<void> => {
  await page.goto(`/iframe.html?id=mechanics-hud-docks--deck-dock&viewMode=story${args ? `&args=${args}` : ""}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
};

const deckPoses = (page: Page): Promise<{ id: string; x: number; y: number }[]> =>
  page.evaluate(() => window.__story!.hud.screenPoses().filter((p) => p.zone === "deck").map((p) => ({ id: p.id, x: p.x, y: p.y })));

test.describe("HUD: док pile-колоды", () => {
  test("колода в HUD — стопка у правого края, РУБАШКАМИ (правило зоны), микрокаскад без рядов", async ({ page }) => {
    await open(page);
    const deck = await deckPoses(page);
    expect(deck.length).toBe(12);
    const vw = page.viewportSize()!.width;
    const xs = deck.map((p) => p.x);
    const ys = deck.map((p) => p.y);
    for (const x of xs) expect(x).toBeGreaterThan(vw * 0.6); // колонка у правого края
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(12); // стопка, не ряд
    const faces = await page.evaluate(() => {
      const s = window.__story!;
      return s.hud.screenPoses().filter((p) => p.zone === "deck").map((p) => s.rt.api.byId.get(p.id)!.faceUp);
    });
    expect(faces.every((f) => f === false)).toBe(true); // рубашки — как на борде
  });

  test("верхняя карта стопки тащится на борд; карта руки дропается В стопку (сверху)", async ({ page }) => {
    await open(page);
    const top = (await deckPoses(page)).at(-1)!;
    await page.mouse.move(top.x, top.y);
    await page.mouse.down();
    await page.mouse.move(180, 300, { steps: 12 });
    await page.waitForTimeout(250);
    await page.mouse.up();
    await page.waitForTimeout(900);
    const slot = await page.evaluate((id) => window.__story!.testHooks().cards[id]!.slot, top.id);
    expect(slot).toMatch(/^board:/); // из стопки — на стол (free-зона: своя свободная стопка)
    // Теперь дроп В стопку: карта руки ложится СВЕРХУ.
    const hand = await page.evaluate(() => window.__story!.hud.screenPoses().filter((p) => p.zone === "hand")[0]!);
    const deck = await deckPoses(page);
    const cx = deck.reduce((a, p) => a + p.x, 0) / deck.length;
    const cy = deck.reduce((a, p) => a + p.y, 0) / deck.length;
    await page.mouse.move(hand.x, hand.y);
    await page.mouse.down();
    await page.mouse.move(cx, cy, { steps: 14 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(900);
    const after = await deckPoses(page);
    expect(after.length).toBe(12); // 12 − 1 (утащили) + 1 (положили)
    expect(after.at(-1)!.id).toBe(hand.id); // легла ВЕРХНЕЙ
  });

  test("живой переезд колоды борд↔HUD: applySpec, сцена ТА ЖЕ, состав цел", async ({ page }) => {
    await open(page, "deckPin:board");
    expect((await deckPoses(page)).length).toBe(0); // на борде — в дереве, не в HUD
    const inTree = await page.evaluate(() => Object.entries(window.__story!.testHooks().cards).filter(([, c]) => c.slot === "deck:0").length);
    expect(inTree).toBe(12);
    await page.evaluate(() => ((window.__story as unknown as { __mark?: number }).__mark = 42));
    await page.getByTestId("deck-to-hud").click();
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => ({
      mark: (window.__story as unknown as { __mark?: number }).__mark,
      docked: window.__story!.hud.screenPoses().filter((p) => p.zone === "deck").length,
    }));
    expect(r.mark).toBe(42); // живая миграция — без пересборки сцены
    expect(r.docked).toBe(12);
  });
});
