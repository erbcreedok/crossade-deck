import { test, expect, type Page } from "@playwright/test";

// ДОК РУКИ ПО КРАЯМ (сторис Mechanics/Hand) — живой движок: вертикальная колонка и сетка это та
// же математика handDock со свёрнутыми осями, но КАК она выглядит и ловит палец — видно только в
// браузере. Дев-хук `__story` — идиома канваса (см. engine.spec.ts).

interface StoryLike {
  hud: { screenPoses(): { zone: string; id: string; x: number; y: number }[]; list(): { insertIndexAt(x: number, y: number): number }[] };
  rt: { api: { byId: Map<string, { faceUp: boolean; body: { px: number; py: number } }>; contentToScreen(x: number, y: number): { x: number; y: number } } };
  testHooks(): { cards: Record<string, { slot: string | null; x: number; y: number }> };
}

declare global {
  interface Window {
    __story?: StoryLike;
    __stories?: StoryLike[];
  }
}

const open = async (page: Page, story: string): Promise<void> => {
  await page.goto(`/iframe.html?id=mechanics-hand--${story}&viewMode=story`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500); // сцена + раздача стори в руку
};

const poses = (page: Page): Promise<{ id: string; x: number; y: number }[]> =>
  page.evaluate(() => window.__story!.hud.screenPoses().map((p) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y) })));

test.describe("док руки по краям", () => {
  test("right-column: колонка у правого края, лица вверх, стол уступил ширину", async ({ page }) => {
    await open(page, "right-column");
    const ps = await poses(page);
    expect(ps.length).toBe(4);
    expect(new Set(ps.map((p) => p.x)).size).toBe(1); // один X — колонка
    const vw = page.viewportSize()!.width;
    expect(ps[0]!.x).toBeGreaterThan(vw * 0.7); // у правого края
    expect(ps[0]!.y).toBeLessThan(ps[3]!.y); // порядок руки сверху вниз
    const faces = await page.evaluate(() => window.__story!.hud.screenPoses().map((p) => window.__story!.rt.api.byId.get(p.id)!.faceUp));
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
    const idx = await page.evaluate(([x, y]) => window.__story!.hud.list()[0]!.insertIndexAt(x!, y!), [gapX, row0y]);
    await page.mouse.up();
    await page.waitForTimeout(900);
    const after = await poses(page);
    expect(after.map((p) => p.id).indexOf(top.id)).toBe(idx);
  });

  test("board-hand: рука зоной НА борде — гэп-превью и дроп со стола в показанный гэп", async ({ page }) => {
    await open(page, "board-hand");
    // Экранные центры карт руки-на-борде — из хуков (контентные точки → экран).
    // hooks.cards — Record в порядке СОЗДАНИЯ нод: порядок руки восстанавливаем сортом по X.
    const hand = await page.evaluate(() => {
      const s = window.__story!;
      return Object.entries(s.testHooks().cards)
        .filter(([, c]) => c.slot === "hand:p1")
        .map(([id, c]) => ({ id, x: Math.round(c.x), y: Math.round(c.y) }))
        .sort((a, b) => a.x - b.x);
    });
    expect(hand.length).toBe(4);
    const top = await page.evaluate(() => {
      const s = window.__story!;
      const deck = Object.entries(s.testHooks().cards)
        .filter(([, c]) => c.slot === "board:0")
        .map(([id]) => id);
      const id = deck[deck.length - 1]!;
      const n = s.rt.api.byId.get(id)! as unknown as { body: { px: number; py: number } };
      return { id, ...s.rt.api.contentToScreen(n.body.px, n.body.py) };
    });
    const gapX = (hand[1]!.x + hand[2]!.x) / 2; // между 2-й и 3-й
    await page.mouse.move(top.x, top.y);
    await page.mouse.down();
    await page.mouse.move(gapX, hand[0]!.y, { steps: 14 });
    await page.waitForTimeout(400);
    // Превью: правая сторона гэпа расступилась (linear левоякорный — левые стоят на месте).
    const spreadOf = (id: string): Promise<number> =>
      page.evaluate((cid) => Math.round(window.__story!.testHooks().cards[cid]!.x), id);
    expect(await spreadOf(hand[1]!.id)).toBeLessThan(hand[1]!.x); // левее гэпа — уехала влево (ряд центрирован)
    expect(await spreadOf(hand[2]!.id)).toBeGreaterThan(hand[2]!.x); // правее — вправо
    await page.mouse.up();
    await page.waitForTimeout(900);
    const order = await page.evaluate(() => {
      const s = window.__story!;
      return Object.entries(s.testHooks().cards)
        .filter(([, c]) => c.slot === "hand:p1")
        .map(([id, c]) => ({ id, x: c.x }))
        .sort((a, b) => a.x - b.x)
        .map((p) => p.id);
    });
    expect(order.indexOf(top.id)).toBe(2); // лёг ровно в показанный гэп
    expect(order.length).toBe(5);
  });

  test("flow-зона с preview:true: жители расступаются, дроп из колоды — в показанный гэп", async ({ page }) => {
    await open(page, "zone-preview");
    const row = await page.evaluate(() => {
      const s = window.__story!;
      return Object.entries(s.testHooks().cards)
        .filter(([, c]) => c.slot === "row:0")
        .map(([id, c]) => ({ id, x: Math.round(c.x), y: Math.round(c.y) }))
        .sort((a, b) => a.y - b.y || a.x - b.x);
    });
    expect(row.length).toBe(3);
    const top = await page.evaluate(() => {
      const s = window.__story!;
      const deck = Object.entries(s.testHooks().cards)
        .filter(([, c]) => c.slot === "board:0")
        .map(([id]) => id);
      const id = deck[deck.length - 1]!;
      const n = s.rt.api.byId.get(id)! as unknown as { body: { px: number; py: number } };
      return { id, ...s.rt.api.contentToScreen(n.body.px, n.body.py) };
    });
    const gapX = (row[0]!.x + row[1]!.x) / 2; // между 1-й и 2-й
    await page.mouse.move(top.x, top.y);
    await page.mouse.down();
    await page.mouse.move(gapX, row[0]!.y, { steps: 14 });
    await page.waitForTimeout(400);
    // КОНТРАКТ «ложится в показанный гэп»: индекс выводим из НАБЛЮДАЕМОГО превью — сколько жителей
    // осталось на месте слева от дыры (linear/grid левоякорные: до гэпа стоят, после — съехали).
    const spread = await page.evaluate((ids) => ids.map((cid) => {
      const c = window.__story!.testHooks().cards[cid]!;
      return { x: Math.round(c.x), y: Math.round(c.y) };
    }), row.map((r) => r.id));
    const shownGap = row.findIndex((r, i) => spread[i]!.x !== r.x || spread[i]!.y !== r.y);
    expect(shownGap).toBeGreaterThanOrEqual(0); // превью видно: кто-то съехал
    await page.mouse.up();
    await page.waitForTimeout(900);
    const order = await page.evaluate(() => {
      const s = window.__story!;
      return Object.entries(s.testHooks().cards)
        .filter(([, c]) => c.slot === "row:0")
        .map(([id, c]) => ({ id, x: c.x, y: c.y }))
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((p) => p.id);
    });
    expect(order.indexOf(top.id)).toBe(shownGap); // ровно в показанный гэп
    expect(order.indexOf(top.id)).toBeLessThan(order.length - 1); // и не в конец
  });

  test("live-two-screens: два экрана над одним портом — своя рука лицом, у соседа она рубашками", async ({ page }) => {
    await open(page, "live-two-screens");
    const r = await page.evaluate(() => {
      const [s1, s2] = window.__stories!;
      const own = s1!.hud.screenPoses().map((p) => ({ id: p.id, faceUp: s1!.rt.api.byId.get(p.id)!.faceUp }));
      // Рука p1 глазами p2: карты живут на его МЕСТЕ (seat-стрип дерева) рубашками.
      const atS2 = own.map((c) => {
        const n = s2!.rt.api.byId.get(c.id);
        return n ? { id: c.id, faceUp: n.faceUp } : null;
      });
      return { own, atS2 };
    });
    expect(r.own.length).toBe(3);
    expect(r.own.every((c) => c.faceUp)).toBe(true); // себе — лицом
    expect(r.atS2.every((c) => c && !c.faceUp)).toBe(true); // соседу — рубашками (hidden по умолчанию)

    // Один порт: ход на левом экране виден правому (карта p1 вернулась в колоду — у обоих).
    const deckAfter = await page.evaluate(() => {
      const [s1, s2] = window.__stories!;
      const id = s1!.hud.screenPoses()[0]!.id;
      (s1 as unknown as { dispatch(c: unknown): void }).dispatch({ t: "move", el: id, from: "hand:p1", to: "board:0" });
      const deckOf = (s: StoryLike) => Object.entries(s.testHooks().cards).filter(([, c]) => c.slot === "board:0").length;
      return { left: deckOf(s1!), right: deckOf(s2!), handLeft: s1!.hud.screenPoses().length };
    });
    expect(deckAfter.left).toBe(deckAfter.right); // один снимок на всех
    expect(deckAfter.handLeft).toBe(2);
  });
});
