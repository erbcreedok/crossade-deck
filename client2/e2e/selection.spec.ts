import { test, expect, type Page } from "@playwright/test";

// Изолированный мультиселект демо-борда «Выделение» (issue #48). Демо: 6 карт в сетке 4×2 —
// слоты 0,0..0,2 (10♠/6♣/8♥) и 1,0..1,2 (A♦/7♣/Q♠), пустые 0,3 и 1,3 как цель для драга набора.
// Хук selectionState — вся UI-правда режима в одном объекте; для z-порядка читаем приватный byId
// (единственный способ в реальном e2e, как в board.spec.ts).
test.describe("песочница — выделение (issue #48)", () => {
  test.use({ viewport: { width: 900, height: 7600 } }); // демо-борды — последняя секция, нужен высокий вьюпорт

  interface Hooks {
    selMode: boolean;
    selectionState: {
      active: boolean;
      selected: string[];
      clearButtonVisibleAt: { x: number; y: number } | null;
      selectToggleAt: { x: number; y: number } | null;
      multiSelectEnabled: boolean;
      sortMode: "selection" | "rank";
    };
    perf: { hoverRerenders: number };
    selFigures: { id: string; x: number; y: number }[];
    selMultiAt: { x: number; y: number }[];
    selSortAt: { x: number; y: number }[];
    boardFigures: { id: string; key: string; x: number; y: number }[];
    boards: { title: string; figures: { id: string; key: string; x: number; y: number }[]; slots: { key: string; x: number; y: number }[] }[];
    cardW: number;
  }
  const hooks = (page: Page): Promise<Hooks> =>
    page.evaluate(() => (window as unknown as { __fd: { testHooks(): Hooks } }).__fd.testHooks());
  const zIndexOf = (page: Page, id: string): Promise<number | undefined> =>
    page.evaluate((cid) => (window as unknown as { __fd: { byId: Map<string, { root: { zIndex: number } }> } }).__fd.byId.get(cid)?.root.zIndex, id);

  const clickAt = async (page: Page, p: { x: number; y: number }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.click(box.x + p.x, box.y + p.y);
  };
  const dragTo = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }, hold = false) => {
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 14 });
    if (!hold) await page.mouse.up();
  };
  const selBoard = (h: Hooks) => h.boards.find((b) => b.title.includes("выделение"))!;
  const enter = async (page: Page) => {
    const h = await hooks(page);
    await clickAt(page, h.selectionState.selectToggleAt!);
  };

  test.beforeEach(async ({ page }) => {
    await page.goto("/free-desk");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  });

  // БАГ 1: клик по «выделение» даёт видимую обратную связь (режим активен + появилась «снять»).
  test("вход в режим: клик по «выделение» → active + кнопка «снять» появляется", async ({ page }) => {
    let h = await hooks(page);
    expect(h.selectionState.active).toBe(false);
    expect(h.selectionState.clearButtonVisibleAt).toBeNull(); // «снять» скрыта вне режима
    expect(h.selectionState.selectToggleAt).not.toBeNull();

    await clickAt(page, h.selectionState.selectToggleAt!);
    h = await hooks(page);
    expect(h.selectionState.active).toBe(true);
    expect(h.selectionState.clearButtonVisibleAt).not.toBeNull(); // теперь видна
  });

  // БАГ 2: 6 карт выделяются и НЕ вылезают за рамку борда (сетка 4×2, а не одна длинная строка).
  test("6 карт: все выделяются и лежат в пределах рамки борда (нет overflow)", async ({ page }) => {
    await enter(page);
    let h = await hooks(page);
    expect(h.selFigures).toHaveLength(6);
    for (const f of h.selFigures) await clickAt(page, f); // выбрать все шесть
    h = await hooks(page);
    expect(h.selectionState.selected).toHaveLength(6);

    // ни одна фигура не ушла за прямоугольник, описанный слотами борда (± полкарты на габарит фигуры).
    const b = selBoard(h);
    const xs = b.slots.map((s) => s.x);
    const ys = b.slots.map((s) => s.y);
    const pad = h.cardW;
    for (const f of h.selFigures) {
      expect(f.x).toBeGreaterThanOrEqual(Math.min(...xs) - pad);
      expect(f.x).toBeLessThanOrEqual(Math.max(...xs) + pad);
      expect(f.y).toBeGreaterThanOrEqual(Math.min(...ys) - pad);
      expect(f.y).toBeLessThanOrEqual(Math.max(...ys) + pad);
    }
  });

  // БАГ 3: long-press (≥500мс) по фигуре без сдвига входит в режим и берёт её в набор.
  test("long-press по фигуре (600мс) входит в режим выделения и берёт фигуру", async ({ page }) => {
    const h = await hooks(page);
    expect(h.selectionState.active).toBe(false);
    const f0 = h.selFigures[0]!;
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + f0.x, box.y + f0.y);
    await page.mouse.down();
    await page.waitForTimeout(600); // держим, не двигая — таймер 500мс должен сработать
    await page.mouse.up();
    await page.waitForTimeout(150);
    const g = await hooks(page);
    expect(g.selectionState.active).toBe(true); // удержание включило режим
    expect(g.selectionState.selected).toContain(f0.id); // и взяло удержанную фигуру
  });

  // БАГ 4: быстрый ховер по канвасу не устраивает шквал перерисовок кнопок (нет цикла-по-всем).
  test("быстрый ховер (100 движений) не вызывает лавину перерисовок кнопок", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    const start = (await hooks(page)).perf.hoverRerenders;
    for (let i = 0; i < 100; i++) {
      await page.mouse.move(box.x + 200 + (i % 2 === 0 ? 60 : -60), box.y + 300, { steps: 1 });
    }
    const end = (await hooks(page)).perf.hoverRerenders;
    // над пустой областью цель ховера не меняется → перерисовок почти нет; в любом случае не по 2/движение.
    expect(end - start).toBeLessThan(50);
  });

  // БАГ 5: при драге набора между слотами фигуры набора визуально ВЫШЕ (в слое драга), не под фоном.
  test("драг набора: тащимые фигуры в верхнем слое (zIndex ≥ 1e6), набор переезжает", async ({ page }) => {
    await enter(page);
    let h = await hooks(page);
    await clickAt(page, h.selFigures[0]!);
    await clickAt(page, h.selFigures[1]!);
    h = await hooks(page);
    expect(h.selectionState.selected).toHaveLength(2);

    const b = selBoard(h);
    const empty = b.slots.find((s) => s.key === "0,3")!; // пустой слот-цель
    const f0 = h.selFigures[0]!;
    const f1 = h.selFigures[1]!;
    await dragTo(page, f0, empty, true); // тянем и ДЕРЖИМ — проверяем z в полёте
    const zs = await Promise.all([f0.id, f1.id].map((id) => zIndexOf(page, id)));
    for (const z of zs) expect(z!).toBeGreaterThanOrEqual(1e6); // весь набор в слое драга, поверх фонов
    await page.mouse.up();
    await page.waitForTimeout(500);

    const g = await hooks(page);
    const sb = g.boards.find((x) => x.title.includes("выделение"))!;
    const at03 = sb.figures.filter((f) => f.key === "0,3").map((f) => f.id).sort();
    expect(at03).toEqual([f0.id, f1.id].sort()); // обе переехали
    expect(g.selectionState.active).toBe(true); // режим остался
    expect(g.selectionState.selected).toEqual([]); // набор сброшен после переноса
  });

  // БАГ 6: выход из режима убирает кнопку «снять» (не зависает видимой).
  test("выход из режима прячет кнопку «снять»", async ({ page }) => {
    await enter(page);
    let h = await hooks(page);
    expect(h.selectionState.clearButtonVisibleAt).not.toBeNull();
    await clickAt(page, h.selectionState.selectToggleAt!); // повторный клик — выход
    h = await hooks(page);
    expect(h.selectionState.active).toBe(false);
    expect(h.selectionState.clearButtonVisibleAt).toBeNull(); // «снять» исчезла
  });

  // БАГ 7: вынос набора сортирует по НОМИНАЛУ (sortMode='rank' по умолчанию).
  test("сорт по номиналу: набор [10,8,6] выносится как [6,8,10]", async ({ page }) => {
    let h = await hooks(page);
    expect(h.selectionState.sortMode).toBe("rank");
    await clickAt(page, h.selectionState.selectToggleAt!);
    h = await hooks(page);

    // ключи → ранги: 0,0=10♠, 0,2=8♥, 0,1=6♣. Выбираем вразнобой (10, потом 8, потом 6).
    const byKey = (key: string) => {
      const fig = selBoard(h).figures.find((f) => f.key === key)!;
      return h.selFigures.find((s) => s.id === fig.id)!;
    };
    const ten = byKey("0,0");
    const eight = byKey("0,2");
    const six = byKey("0,1");
    await clickAt(page, ten);
    await clickAt(page, eight);
    await clickAt(page, six);

    const empty = selBoard(await hooks(page)).slots.find((s) => s.key === "0,3")!;
    await dragTo(page, ten, empty);
    await page.waitForTimeout(500);

    const g = await hooks(page);
    const order03 = g.boards.find((x) => x.title.includes("выделение"))!.figures.filter((f) => f.key === "0,3").map((f) => f.id);
    expect(order03).toEqual([six.id, eight.id, ten.id]); // по возрастанию номинала: 6, 8, 10
  });

  // Порядок ВЫБОРА (sortMode='selection') — тумблер «сорт набора: выбор» отменяет сорт по номиналу.
  test("сорт «по выбору»: тумблер выключает сорт по номиналу — порядок как выделяли", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, h.selSortAt[1]!); // "выбор"
    await page.waitForTimeout(150);
    await clickAt(page, h.selectionState.selectToggleAt!);
    h = await hooks(page);
    expect(h.selectionState.sortMode).toBe("selection");

    const byKey = (key: string) => {
      const fig = selBoard(h).figures.find((f) => f.key === key)!;
      return h.selFigures.find((s) => s.id === fig.id)!;
    };
    const ten = byKey("0,0"); // rank 10
    const six = byKey("0,1"); // rank 6
    await clickAt(page, ten); // выбираем 10, потом 6 — по рангу был бы [6,10]
    await clickAt(page, six);

    const empty = selBoard(await hooks(page)).slots.find((s) => s.key === "0,3")!;
    await dragTo(page, ten, empty);
    await page.waitForTimeout(500);

    const g = await hooks(page);
    const order03 = g.boards.find((x) => x.title.includes("выделение"))!.figures.filter((f) => f.key === "0,3").map((f) => f.id);
    expect(order03).toEqual([ten.id, six.id]); // порядок выбора (10, затем 6), НЕ по рангу
  });

  // ИЗОЛЯЦИЯ: в режиме нельзя выбрать фигуру чужой зоны.
  test("изоляция: фигура чужого борда не попадает в набор", async ({ page }) => {
    await enter(page);
    await clickAt(page, { x: (await hooks(page)).boardFigures[0]!.x, y: (await hooks(page)).boardFigures[0]!.y });
    const g = await hooks(page);
    expect(g.selectionState.selected).toEqual([]);
  });

  // БАГ (issue #55): тень выделенной карты не должна оказаться ПОВЕРХ карты. Тень рисуется в слой
  // levelOf(state); значит спрайт карты обязан лежать в ПАРНОМ слое того же уровня — иначе тень
  // (floating) уедет выше спрайта (застрявшего в idle). Проверяем совпадение слоя спрайта с уровнем.
  test("тень под картой: спрайт выделённой карты в floating-слое (не idle)", async ({ page }) => {
    await enter(page);
    const h = await hooks(page);
    const id = h.selFigures[0]!.id;
    await clickAt(page, h.selFigures[0]!); // выбрать → floating

    const layers = await page.evaluate((cid) => {
      const fd = window.__fd as unknown as {
        byId: Map<string, { root: { parent: unknown }; state: string }>;
        scene: { cards: Record<string, unknown> };
      };
      const el = fd.byId.get(cid)!;
      const parent = el.root.parent;
      return {
        state: el.state,
        inIdle: parent === fd.scene.cards.idle,
        inFloating: parent === fd.scene.cards.floating,
      };
    }, id);

    expect(layers.state).toBe("floating"); // логически выделена
    expect(layers.inFloating).toBe(true); // спрайт в floating-слое — тень (тоже floating) под ним
    expect(layers.inIdle).toBe(false); // НЕ застрял в idle (иначе тень окажется выше карты)
  });

  // Мультиселект выкл — вход в режим блокируется конфигом контейнера.
  test("мультиселект: выкл — вход в режим заблокирован", async ({ page }) => {
    const h = await hooks(page);
    await clickAt(page, h.selMultiAt[1]!); // "выкл"
    await page.waitForTimeout(150);
    await clickAt(page, h.selectionState.selectToggleAt!);
    const g = await hooks(page);
    expect(g.selectionState.active).toBe(false);
    expect(g.selectionState.multiSelectEnabled).toBe(false);
  });
});
