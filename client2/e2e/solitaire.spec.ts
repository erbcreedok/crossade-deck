import { test, expect, type Page } from "@playwright/test";

// «Косынка» на общем слое сцены (issue #96). КАЖДЫЙ кейс здесь — баг, который владелец ловил
// руками; список зафиксирован в SOLITAIRE-REBUILD-HANDOFF §6 («обязательные тест-кейсы»), потому
// что визуальный слой не покрывается ничем другим: Pixi в node не исполняется, и зелёные
// tsc/vitest/build про него не знают вообще.
//
// Отдельно про дырявые проверки: теста «нелегальный дроп ничего не изменил» тут НЕТ — он даёт
// тот же результат, что и полностью неработающий драг, и не доказывает ничего. Каждый кейс ниже
// доказывает, что доска ИЗМЕНИЛАСЬ так, как задумано.
//
// Канвас не отдаёт ни DOM-узлов, ни ролей, поэтому вся геометрия — через дев-хук `window.__sol`
// (тот же приём, что `__fd` у песочницы).

interface Hooks {
  slots: Record<string, { x: number; y: number; w: number; h: number }>;
  cards: Record<string, { x: number; y: number; faceUp: boolean; scale: number; rot: number; state: string }>;
  cardSize: { w: number; h: number } | null;
  topbar: Record<string, { x: number; y: number; w: number; h: number }>;
  screen: { visible: boolean; buttons: Record<string, { x: number; y: number; w: number; h: number }> };
  zoom: number;
}

interface Snapshot {
  phase: string;
  movesCount: number;
  slots: Record<string, string[]>;
  faceUp: Record<string, boolean>;
  possible: Array<{ from: string; to: string; card: string }>;
}

type Win = { __sol: { testHooks(): Hooks; engine: { getState(): unknown; getPossibleMoves(): unknown } } };

const hooks = (page: Page): Promise<Hooks> => page.evaluate(() => (window as unknown as Win).__sol.testHooks());

const snap = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => {
    const s = (window as unknown as Win).__sol;
    const g = s.engine.getState() as {
      phase: string;
      movesCount: number;
      faceUp: Record<string, boolean>;
      board: { slots: Record<string, { members: string[] }> };
    };
    return {
      phase: g.phase,
      movesCount: g.movesCount,
      faceUp: g.faceUp,
      slots: Object.fromEntries(Object.entries(g.board.slots).map(([k, v]) => [k, v.members])),
      possible: s.engine.getPossibleMoves() as Array<{ from: string; to: string; card: string }>,
    };
  });

/** Раздать партию: «Новая игра» — КАНВАСНАЯ кнопка на экране меню, не HTML. */
async function deal(page: Page): Promise<void> {
  await page.goto("/solitaire");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  const h = await hooks(page);
  await page.mouse.click(h.screen.buttons.start!.x, h.screen.buttons.start!.y);
  await page.waitForTimeout(700);
}

/** Точка захвата карты: её ВИДИМАЯ полоска. В каскаде центр закрыт следующей картой, и хит-тест
 *  справедливо отдаёт верхнюю — тянуть надо за то, что видно. */
function grabPoint(h: Hooks, cardId: string, slot: string): { x: number; y: number } {
  const c = h.cards[cardId]!;
  if (!slot.startsWith("tab:")) return { x: c.x, y: c.y };
  const step = 40 * h.zoom; // CASCADE_STEP из solitaire/tree.ts
  return { x: c.x, y: c.y - h.cardSize!.h / 2 + step * 0.4 };
}

test.describe("Косынка", () => {
  test("#11 тап по стоку: сток −1, сброс +1", async ({ page }) => {
    await deal(page);
    const before = await snap(page);
    const h = await hooks(page);
    await page.mouse.click(h.slots.stock!.x + h.slots.stock!.w / 2, h.slots.stock!.y + h.slots.stock!.h / 2);
    await page.waitForTimeout(400);
    const after = await snap(page);

    expect(after.slots.stock!.length).toBe(before.slots.stock!.length - 1);
    expect(after.slots.waste!.length).toBe(before.slots.waste!.length + 1);
  });

  test("#3 легальный ход из движка, выполненный МЫШЬЮ, принимается и меняет доску", async ({ page }) => {
    await deal(page);
    let s = await snap(page);
    // Ходов в раздаче может не быть вовсе — тогда сдаём из стока, пока не появятся.
    for (let i = 0; i < 24 && s.possible.length === 0; i++) {
      const h = await hooks(page);
      await page.mouse.click(h.slots.stock!.x + h.slots.stock!.w / 2, h.slots.stock!.y + h.slots.stock!.h / 2);
      await page.waitForTimeout(220);
      s = await snap(page);
    }
    expect(s.possible.length, "легальный ход должен найтись").toBeGreaterThan(0);

    const mv = s.possible[0]!;
    const h = await hooks(page);
    const from = grabPoint(h, mv.card, mv.from);
    const to = h.slots[mv.to]!;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x + to.w / 2, to.y + to.h / 2, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(800);

    const after = await snap(page);
    expect(after.slots[mv.to]).toContain(mv.card); // карта в ЦЕЛЕВОМ слоте
    expect(after.slots[mv.from]).not.toContain(mv.card);
    expect(after.movesCount).toBeGreaterThan(s.movesCount);
  });

  test("#2 драг поднимает карту и возвращает её ПРУЖИНОЙ, а не телепортом", async ({ page }) => {
    await deal(page);
    const s = await snap(page);
    const card = s.slots["tab:6"]!.at(-1)!;
    const h = await hooks(page);
    const home = { x: h.cards[card]!.x, y: h.cards[card]!.y };

    await page.mouse.move(home.x, home.y);
    await page.mouse.down();
    await page.mouse.move(home.x - 120, home.y - 90, { steps: 10 });
    await page.waitForTimeout(200);

    const held = (await hooks(page)).cards[card]!;
    expect(held.state, "схваченная карта — в плане драга").toBe("drag");
    expect(held.scale, "карта ПОДНЯЛАСЬ над столом").toBeGreaterThan(1.1);
    expect(Math.hypot(held.x - home.x, held.y - home.y), "карта едет за пальцем").toBeGreaterThan(50);

    // Отпускаем заведомо мимо зон — карта обязана вернуться домой, и не одним кадром.
    await page.mouse.move(home.x - 120, home.y + 260, { steps: 6 });
    await page.mouse.up();
    const frames: number[] = [];
    for (let i = 0; i < 5; i++) {
      frames.push((await hooks(page)).cards[card]!.y);
      await page.waitForTimeout(45);
    }
    await page.waitForTimeout(700);

    const rest = (await hooks(page)).cards[card]!;
    expect(new Set(frames.map((y) => Math.round(y))).size, "полёт домой идёт кадрами").toBeGreaterThan(1);
    expect(Math.abs(rest.y - home.y), "карта вернулась ровно домой").toBeLessThan(2);
    expect(rest.state).not.toBe("drag");
  });

  test("#9 после хода карта ЛЕТИТ, а не телепортируется", async ({ page }) => {
    await deal(page);
    const s = await snap(page);
    const card = s.slots["tab:6"]!.at(-1)!;
    const h = await hooks(page);
    const start = { x: h.cards[card]!.x, y: h.cards[card]!.y };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - 200, start.y - 200, { steps: 10 });
    await page.mouse.up();

    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const c = (await hooks(page)).cards[card]!;
      seen.add(`${Math.round(c.x)},${Math.round(c.y)}`);
      await page.waitForTimeout(40);
    }
    expect(seen.size, "между стартом и домом есть промежуточные кадры").toBeGreaterThan(2);
  });

  test("#5 экранный центр карты совпадает с центром её зоны", async ({ page }) => {
    await deal(page);
    const s = await snap(page);
    const h = await hooks(page);
    for (const [slot, members] of Object.entries(s.slots)) {
      const first = members[0];
      if (!first) continue;
      const r = h.slots[slot]!;
      const c = h.cards[first]!;
      expect(Math.abs(c.x - (r.x + r.w / 2)), `${slot}: сдвиг по X`).toBeLessThan(1);
      expect(Math.abs(c.y - (r.y + r.h / 2)), `${slot}: сдвиг по Y`).toBeLessThan(1);
    }
  });

  test("#6 карта помещается в свой слот (baseScale не единица)", async ({ page }) => {
    await deal(page);
    const h = await hooks(page);
    expect(h.cardSize).not.toBeNull();
    expect(h.cardSize!.w).toBeLessThanOrEqual(h.slots.stock!.w + 1);
    expect(h.cardSize!.h).toBeLessThanOrEqual(h.slots.stock!.h + 1);
  });

  test("#7 лицо карты совпадает с состоянием движка (в т.ч. открытая под снятой)", async ({ page }) => {
    await deal(page);
    // Делаем ход, чтобы под снятой картой открылась следующая — там баг и жил.
    let s = await snap(page);
    for (let i = 0; i < 24 && s.possible.filter((m) => m.from.startsWith("tab:")).length === 0; i++) {
      const h = await hooks(page);
      await page.mouse.click(h.slots.stock!.x + h.slots.stock!.w / 2, h.slots.stock!.y + h.slots.stock!.h / 2);
      await page.waitForTimeout(200);
      s = await snap(page);
    }
    const mv = s.possible.find((m) => m.from.startsWith("tab:"));
    if (mv) {
      const h = await hooks(page);
      const from = grabPoint(h, mv.card, mv.from);
      const to = h.slots[mv.to]!;
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x + to.w / 2, to.y + to.h / 2, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(900);
    }

    const after = await snap(page);
    const h2 = await hooks(page);
    const mismatch = Object.entries(h2.cards).filter(([id, c]) => c.faceUp !== (after.faceUp[id] === true));
    expect(mismatch.map(([id]) => id), "рисуемое лицо расходится с движком").toEqual([]);
  });

  test("#10 колонка идёт вертикальным каскадом, и сток не перекрыт её картами", async ({ page }) => {
    await deal(page);
    const s = await snap(page);
    const h = await hooks(page);
    const col = s.slots["tab:6"]!;
    for (let i = 1; i < col.length; i++) {
      const prev = h.cards[col[i - 1]!]!;
      const cur = h.cards[col[i]!]!;
      expect(Math.abs(cur.x - prev.x), "карты колонки не расходятся вбок").toBeLessThan(1);
      expect(cur.y, "каждая следующая карта НИЖЕ предыдущей").toBeGreaterThan(prev.y);
    }
    // Веер уводил карты вверх на верхний ряд, и тап по стоку попадал в наехавшую карту колонки.
    const stock = h.slots.stock!;
    const before = s.slots.stock!.length;
    await page.mouse.click(stock.x + stock.w / 2, stock.y + stock.h / 2);
    await page.waitForTimeout(350);
    expect((await snap(page)).slots.stock!.length).toBe(before - 1);
  });

  test("#4 зум: Ctrl+колесо зумит, колесо без модификатора панит", async ({ page }) => {
    await deal(page);
    const view = () =>
      page.evaluate(() => {
        const vp = (window as unknown as { __sol: { viewport: { x: number; y: number; zoom: number } } }).__sol.viewport;
        return { x: Math.round(vp.x), y: Math.round(vp.y), zoom: +vp.zoom.toFixed(3) };
      });
    const start = await view();

    await page.mouse.move(250, 400);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -600); // приближаем ЗАМЕТНО: иначе доска всё ещё влезает и панить нечего
    await page.keyboard.up("Control");
    await page.waitForTimeout(250);
    const zoomed = await view();
    expect(zoomed.zoom, "Ctrl+колесо приближает").toBeGreaterThan(start.zoom);

    // Приблизились — теперь контент больше экрана, и обычному колесу есть что панить. Крутим в ОБЕ
    // стороны: зум вокруг точки мог оставить вид у самой кромки, и в одну сторону кламп его держит.
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(250);
    const down = await view();
    await page.mouse.wheel(0, -250);
    await page.waitForTimeout(250);
    const up = await view();

    expect(up.zoom, "колесо без модификатора зум НЕ трогает").toBe(zoomed.zoom);
    expect(down.y !== zoomed.y || up.y !== down.y, "колесо без модификатора панит").toBe(true);
  });

  test("#8 «новая игра» действительно пересобирает доску", async ({ page }) => {
    await deal(page);
    const h0 = await hooks(page);
    await page.mouse.click(h0.slots.stock!.x + h0.slots.stock!.w / 2, h0.slots.stock!.y + h0.slots.stock!.h / 2);
    await page.waitForTimeout(300);
    const played = await snap(page);
    expect(played.movesCount).toBeGreaterThan(0);

    const bar = (await hooks(page)).topbar["new-game"]!;
    await page.mouse.click(bar.x, bar.y);
    await page.waitForTimeout(900);

    const fresh = await snap(page);
    expect(fresh.movesCount, "счётчик обнулился").toBe(0);
    expect(fresh.slots.stock!.length, "сток снова полон").toBe(24);
    expect(fresh.slots.waste!.length).toBe(0);
    expect(fresh.slots["tab:6"]!.length).toBe(7);
  });

  test("#12 узкое окно и ресайз: доска видна целиком, канвас следует за окном", async ({ page }) => {
    await deal(page);
    const fits = async () => {
      const h = await hooks(page);
      const rects = Object.values(h.slots);
      const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
      return {
        left: Math.min(...rects.map((r) => r.x)),
        right: Math.max(...rects.map((r) => r.x + r.w)),
        top: Math.min(...rects.map((r) => r.y)),
        size,
      };
    };

    await page.setViewportSize({ width: 360, height: 640 });
    await page.waitForTimeout(600);
    const narrow = await fits();
    expect(narrow.left).toBeGreaterThanOrEqual(-1);
    expect(narrow.right).toBeLessThanOrEqual(narrow.size.w + 1);
    expect(narrow.top, "верх доски не заезжает под топбар").toBeGreaterThanOrEqual(52);

    await page.setViewportSize({ width: 900, height: 700 });
    await page.waitForTimeout(600);
    const wide = await fits();
    expect(wide.right).toBeLessThanOrEqual(wide.size.w + 1);
    const canvas = await page.locator("canvas").boundingBox();
    expect(Math.round(canvas!.width)).toBe(900);
  });

  test("#1 один и тот же жест даёт на /solitaire то же, что на /playground", async ({ page }) => {
    // Обе сцены ведут камеру одним общим SceneEngine, поэтому расхождение здесь означало бы, что
    // пасьянс снова обзавёлся собственным вводом. Сверяем колесом, а не пальцем: колесо не зависит
    // от того, попал ли жест по пустому месту, и потому сравнивает именно КАМЕРУ.
    const wheelGesture = async (hookName: "__sol" | "__fd") => {
      const view = () =>
        page.evaluate((n) => {
          const vp = (window as unknown as Record<string, { viewport: { x: number; y: number; zoom: number } }>)[n]!.viewport;
          return { x: Math.round(vp.x), y: Math.round(vp.y), zoom: +vp.zoom.toFixed(3) };
        }, hookName);

      const before = await view();
      await page.mouse.move(250, 400);
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -600);
      await page.keyboard.up("Control");
      await page.waitForTimeout(300);
      const zoomed = await view();
      // В обе стороны: после зума вокруг точки вид может стоять у самой кромки, и в одну сторону
      // его держит кламп — это одинаково верно для обеих сцен, но зависит от размера контента.
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(300);
      const down = await view();
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(300);
      const up = await view();
      return {
        zoomGrew: zoomed.zoom > before.zoom,
        wheelKeptZoom: up.zoom === zoomed.zoom,
        wheelMovedView: down.y !== zoomed.y || up.y !== down.y,
      };
    };

    await deal(page);
    const sol = await wheelGesture("__sol");

    await page.goto("/playground");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    const sandbox = await wheelGesture("__fd");

    expect(sol).toEqual(sandbox);
    expect(sol.zoomGrew).toBe(true);
    expect(sol.wheelKeptZoom).toBe(true);
    expect(sol.wheelMovedView).toBe(true);
  });
});
