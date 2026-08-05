import { test, expect, type Page } from "@playwright/test";

// РУКА-ДОК (экранный HUD) — e2e на живом движке: гэп-превью, устойчивость индекса вставки,
// живой реперент борда↔рука и гонка флипа при мгновенной раздаче. Это ровно те проверки, что
// раньше гонялись вручную MCP-скриптами после каждого шага, — теперь они сторожа и живут здесь.
// Дев-хук `__sandbox` — идиома канваса (см. e2e/catalog/engine.spec.ts): DOM-узлов у сцены нет.

interface SandboxLike {
  handHud: {
    screenPoses(): { id: string; x: number; y: number }[];
    insertIndexAt(x: number, y: number): number;
    root: unknown;
  };
  rt: { api: { byId: Map<string, { faceUp: boolean; root: { parent: unknown }; body: { px: number; py: number } }>; contentToScreen(x: number, y: number): { x: number; y: number } } };
  testHooks(): { cards: Record<string, { slot: string | null }> };
  dispatch(cmd: unknown): void;
}

declare global {
  interface Window {
    __sandbox?: SandboxLike;
  }
}

/** Раздать n карт с верха колоды в руку тем же портом, что и палец. */
const deal = (page: Page, n: number): Promise<void> =>
  page.evaluate((count) => {
    const s = window.__sandbox!;
    const deck = Object.entries(s.testHooks().cards)
      .filter(([, c]) => c.slot === "board:0")
      .map(([id]) => id);
    for (const id of deck.slice(-count)) s.dispatch({ t: "move", el: id, from: "board:0", to: "hand:p1" });
  }, n);

const poses = (page: Page): Promise<{ id: string; x: number; y: number }[]> =>
  page.evaluate(() => window.__sandbox!.handHud.screenPoses().map((p) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y) })));

/** Экранная точка верхней карты колоды (лидер будущего драга). */
const deckTop = (page: Page): Promise<{ id: string; x: number; y: number }> =>
  page.evaluate(() => {
    const s = window.__sandbox!;
    const deck = Object.entries(s.testHooks().cards)
      .filter(([, c]) => c.slot === "board:0")
      .map(([id]) => id);
    const id = deck[deck.length - 1]!;
    const n = s.rt.api.byId.get(id)!;
    const sp = s.rt.api.contentToScreen(n.body.px, n.body.py);
    return { id, x: sp.x, y: sp.y };
  });

test.describe("рука-док", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/playground");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
  });

  test("мгновенная раздача после загрузки — карты руки ЛИЦОМ (гонка флипа закрыта)", async ({ page }) => {
    // Узел колоды рождается лицом и тут же флипается вниз; раздача в руку во время этой анимации
    // раньше молча теряла заказ «лицом» (faceUp отстаёт — сторож faceUpTarget, tableItem.test).
    await deal(page, 3);
    await page.waitForTimeout(900);
    const faces = await page.evaluate(() =>
      window.__sandbox!.handHud.screenPoses().map((p) => window.__sandbox!.rt.api.byId.get(p.id)!.faceUp),
    );
    expect(faces).toEqual([true, true, true]);
  });

  test("гэп-превью: ряд раздвигается, индекс не дрожит, дроп ложится ровно в показанный гэп", async ({ page }) => {
    await deal(page, 3);
    await page.waitForTimeout(900);
    const base = await poses(page);
    const top = await deckTop(page);
    const gapX = (base[1]!.x + base[2]!.x) / 2; // между 2-й и 3-й картами
    const bandY = base[0]!.y;

    await page.mouse.move(top.x, top.y);
    await page.mouse.down();
    await page.mouse.move(gapX, bandY, { steps: 14 });
    await page.waitForTimeout(400); // превью доехало

    const spread = await poses(page);
    expect(spread.map((p) => p.x)).not.toEqual(base.map((p) => p.x)); // ряд раздвинулся
    // Устойчивость цели (канон playHover): микродрожь пальца не шатает индекс вставки.
    const jitter = await page.evaluate(
      ([x, y]) => [window.__sandbox!.handHud.insertIndexAt(x! - 3, y!), window.__sandbox!.handHud.insertIndexAt(x!, y!), window.__sandbox!.handHud.insertIndexAt(x! + 3, y!)],
      [gapX, bandY],
    );
    expect(new Set(jitter).size).toBe(1);
    // Живой реперент: груз над рукой лежит на СЛОЕ РУКИ (одна нода, поверх своих).
    const layer = await page.evaluate((id) => {
      const s = window.__sandbox!;
      return s.rt.api.byId.get(id)!.root.parent === s.handHud.root ? "hand" : "content";
    }, top.id);
    expect(layer).toBe("hand");

    await page.mouse.up();
    await page.waitForTimeout(900);
    const after = await poses(page);
    expect(after.map((p) => p.id).indexOf(top.id)).toBe(jitter[0]!); // лёг ровно в показанный гэп
  });

  test("реордер внутри руки: первая карта уезжает в конец", async ({ page }) => {
    await deal(page, 3);
    await page.waitForTimeout(900);
    const base = await poses(page);
    const first = base[0]!;
    const endX = base[base.length - 1]!.x + 70;

    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    await page.mouse.move(endX, first.y, { steps: 10 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(900);

    const after = await poses(page);
    expect(after.map((p) => p.id)).toEqual([...base.slice(1).map((p) => p.id), first.id]);
  });

  test("уводишь груз с полосы — гэп смыкается, карта остаётся на борде (отмена без последствий)", async ({ page }) => {
    await deal(page, 3);
    await page.waitForTimeout(900);
    const base = await poses(page);
    const top = await deckTop(page);

    await page.mouse.move(top.x, top.y);
    await page.mouse.down();
    await page.mouse.move((base[0]!.x + base[1]!.x) / 2, base[0]!.y, { steps: 12 }); // над рукой
    await page.waitForTimeout(300);
    await page.mouse.move(top.x, top.y - 40, { steps: 12 }); // увёл обратно на стол
    await page.waitForTimeout(400);
    const closed = await poses(page);
    expect(closed.map((p) => p.x)).toEqual(base.map((p) => p.x)); // гэп сомкнулся
    await page.mouse.up();
    await page.waitForTimeout(900);
    const slot = await page.evaluate((id) => window.__sandbox!.testHooks().cards[id]!.slot, top.id);
    expect(slot).toBe("board:0"); // в руку не попала
    expect((await poses(page)).length).toBe(3);
  });
});
