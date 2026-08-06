import { test, expect, type Page } from "@playwright/test";

// HUD (сторис Mechanics/Hud) — живой движок: флекс-доки (доля + константа), ДВЕ ленты у одного
// игрока (рука-карты + мешок-фишки), ЖИВАЯ миграция зоны борд↔HUD (applySpec: сцена та же, ноды
// перелетают) и live-вид двух лент глазами соседа. Дев-хук `__story`/`__stories` — идиома канваса.

interface StoryLike {
  hud: { screenPoses(): { zone: string; id: string; x: number; y: number }[] };
  rt: { api: { byId: Map<string, { faceUp: boolean }> } };
  testHooks(): { cards: Record<string, { slot: string | null; x: number; y: number }> };
}

declare global {
  interface Window {
    __story?: StoryLike;
    __stories?: StoryLike[];
  }
}

const open = async (page: Page, story: string): Promise<void> => {
  await page.goto(`/iframe.html?id=mechanics-hud--${story}&viewMode=story`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
};

const dockedOf = (page: Page, zone: string): Promise<{ id: string; x: number; y: number }[]> =>
  page.evaluate((z) => window.__story!.hud.screenPoses().filter((p) => p.zone === z).map((p) => ({ id: p.id, x: p.x, y: p.y })), zone);

test.describe("HUD: флекс-доки и ленты-виджеты", () => {
  test("flex-docks: рука auto-долей у низа, px-константа «реакций» держит свой отрезок", async ({ page }) => {
    await open(page, "flex-docks");
    const hand = await dockedOf(page, "hand");
    expect(hand.length).toBe(4);
    const vh = page.viewportSize()!.height;
    const vw = page.viewportSize()!.width;
    for (const p of hand) expect(p.y).toBeGreaterThan(vh * 0.7); // низ экрана
    // Правые 220px нижнего дока — у «реакций»: карты руки туда не заезжают.
    for (const p of hand) expect(p.x).toBeLessThan(vw - 220);
  });

  test("two-hands: обе ленты в HUD — рука картами, мешок фишками в своём отрезке дока", async ({ page }) => {
    await open(page, "two-hands");
    const hand = await dockedOf(page, "hand");
    const pouch = await dockedOf(page, "pouch");
    expect(hand.length).toBe(4);
    expect(pouch.length).toBe(8);
    // Мешок — px-константа справа в нижнем доке: его жители правее всех карт руки.
    const maxHandX = Math.max(...hand.map((p) => p.x));
    for (const p of pouch) expect(p.x).toBeGreaterThan(maxHandX);
  });

  test("живая миграция: «рука → борд» перекидывает зону БЕЗ пересборки сцены и без потерь", async ({ page }) => {
    await open(page, "two-hands");
    // Пометка на сцене: если кнопка пересоздаст сцену, пометка пропадёт — миграция обязана быть живой.
    await page.evaluate(() => ((window.__story as unknown as { __mark?: number }).__mark = 42));
    await page.getByTestId("hand-to-board").click();
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const s = window.__story!;
      const inTree = Object.entries(s.testHooks().cards).filter(([, c]) => c.slot === "hand:p1").length;
      return {
        mark: (s as unknown as { __mark?: number }).__mark,
        docked: s.hud.screenPoses().filter((p) => p.zone === "hand").length,
        inTree,
        pouchDocked: s.hud.screenPoses().filter((p) => p.zone === "pouch").length,
      };
    });
    expect(r.mark).toBe(42); // сцена ТА ЖЕ — жители перелетели, не пересоздались
    expect(r.docked).toBe(0); // рука ушла из HUD…
    expect(r.inTree).toBe(4); // …и легла полосой на борду, все 4 карты целы
    expect(r.pouchDocked).toBe(8); // мешок остался в доке

    await page.getByTestId("hand-to-hud").click();
    await page.waitForTimeout(900);
    expect((await dockedOf(page, "hand")).length).toBe(4); // обратно в док — без потерь
  });

  test("live-two-hands: соседу видны ДВЕ зоны владельца — рука рубашками, мешок открыт", async ({ page }) => {
    await open(page, "live-two-hands");
    const r = await page.evaluate(() => {
      const [s1, s2] = window.__stories!;
      const own = s1!.hud.screenPoses().filter((p) => p.zone === "hand");
      const ownFaces = own.map((p) => s1!.rt.api.byId.get(p.id)!.faceUp);
      // Глазами p2: лента hand:p1 и мешок pouch:p1 — два РАЗНЫХ слота дерева.
      const cards2 = s2!.testHooks().cards;
      const handAtS2 = Object.entries(cards2).filter(([, c]) => c.slot === "hand:p1");
      const pouchAtS2 = Object.entries(cards2).filter(([, c]) => c.slot === "pouch:p1");
      return {
        ownCount: own.length,
        ownFaces,
        handFacesAtS2: handAtS2.map(([id]) => s2!.rt.api.byId.get(id)!.faceUp),
        pouchCountAtS2: pouchAtS2.length,
      };
    });
    expect(r.ownCount).toBe(3);
    expect(r.ownFaces).toEqual([true, true, true]); // себе — лицом
    expect(r.handFacesAtS2).toEqual([false, false, false]); // соседу — рубашками (hidden)
    expect(r.pouchCountAtS2).toBe(4); // мешок — отдельной зоной у места владельца
  });
});
