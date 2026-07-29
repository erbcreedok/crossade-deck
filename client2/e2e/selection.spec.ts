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
      assembly: {
        preset?: string;
        form: "stack-tight" | "stack-open" | "row" | "fan";
        order: "proximity" | "selection" | "append";
        sortOverride: "none" | "rank" | "suit" | "center";
      };
      visual: { eligible: "cards" | "diamonds" | "any"; hintEligible: boolean; mark: "lift" | "outline" | "both" };
      policy: { onDropOutside: "return-home" | "stay" | "dissolve" };
    };
    perf: { hoverRerenders: number };
    selDropOutsideAt: { x: number; y: number }[];
    selFigures: { id: string; key: string; x: number; y: number; selected: boolean; outlined: boolean; hinted: boolean }[];
    selMultiAt: { x: number; y: number }[];
    selPresetAt: { x: number; y: number }[];
    selFormAt: { x: number; y: number }[];
    selOrderAt: { x: number; y: number }[];
    selSortAt: { x: number; y: number }[];
    selEligibleAt: { x: number; y: number }[];
    selHintAt: { x: number; y: number }[];
    selMarkAt: { x: number; y: number }[];
    boardFigures: { id: string; key: string; x: number; y: number }[];
    boards: { title: string; figures: { id: string; key: string; x: number; y: number }[]; slots: { key: string; x: number; y: number }[] }[];
    zones: Record<string, { x: number; y: number }>;
    lastNamedSuits: string[];
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
    await page.goto("/playground");
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

  // БАГ 2: карты выделяются и НЕ вылезают за рамку борда (сетка 4×2, а не одна длинная строка).
  // 7 фигур: 6 обычных + джокер в слоте 1,3 (issue #62 — «???» в логе; добавлен последним).
  test("7 карт: все выделяются и лежат в пределах рамки борда (нет overflow)", async ({ page }) => {
    await enter(page);
    let h = await hooks(page);
    expect(h.selFigures).toHaveLength(7);
    for (const f of h.selFigures) await clickAt(page, f); // выбрать все семь
    h = await hooks(page);
    expect(h.selectionState.selected).toHaveLength(7);

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

  // Override по НОМИНАЛУ: включаем «сорт: номинал» (sortOverride=rank) — набор выносится [6,8,10].
  test("сорт по номиналу: набор [10,8,6] выносится как [6,8,10]", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, h.selSortAt[1]!); // сорт: номинал (override)
    await page.waitForTimeout(150);
    await clickAt(page, h.selectionState.selectToggleAt!);
    h = await hooks(page);
    expect(h.selectionState.assembly.sortOverride).toBe("rank");

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

  // Порядок ВЫБОРА (order=selection, без override) — набор выносится как выделяли, не по номиналу.
  test("сорт «по выбору»: порядок как выделяли (order=selection, override=none)", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, h.selOrderAt[1]!); // порядок: выбор
    await page.waitForTimeout(150);
    await clickAt(page, h.selectionState.selectToggleAt!);
    h = await hooks(page);
    expect(h.selectionState.assembly.order).toBe("selection");
    expect(h.selectionState.assembly.sortOverride).toBe("none");

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

  // ——— сборка набора в РЯД + модификаторы порядка (issue #56) ———
  // Индексы selFigures = порядок слотов: 0=10♠, 1=6♣(♣), 2=8♥(♥), 3=A♦(♦), 4=7♣, 5=Q♠.
  // Держим драг и читаем позиции 3 тащимых карт: должны стоять в ОДНУ строку (равный y),
  // x строго по возрастанию в порядке выбранной стратегии.
  const rowXOrder = async (page: Page, ids: string[]) => {
    const h = await hooks(page);
    const pos = (id: string) => h.selFigures.find((f) => f.id === id)!;
    const ys = ids.map((id) => pos(id).y);
    const xs = ids.map((id) => pos(id).x);
    return { ys, xs };
  };
  const selectByIdx = async (page: Page, idxs: number[]) => {
    let h = await hooks(page);
    const ids: string[] = [];
    for (const i of idxs) {
      const f = h.selFigures[i]!;
      ids.push(f.id);
      await clickAt(page, f);
      h = await hooks(page);
    }
    return ids;
  };

  test("сборка в ряд «по нажатию»: карты встают в строку, x по порядку нажатия", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, h.selFormAt[2]!); // форма: ряд
    await clickAt(page, h.selOrderAt[1]!); // порядок: выбор (order=selection)
    await clickAt(page, h.selectionState.selectToggleAt!);
    h = await hooks(page);
    expect(h.selectionState.assembly.form).toBe("row");
    expect(h.selectionState.assembly.order).toBe("selection");

    const [cA, c6, c8] = await selectByIdx(page, [3, 1, 2]); // press-порядок: A♦, 6♣, 8♥
    // старт драга за первую выбранную, держим
    const box = (await page.locator("canvas").boundingBox())!;
    let p = h.selFigures[3]!;
    await page.mouse.move(box.x + p.x, box.y + p.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 250, box.y + 300, { steps: 12 }); // тянем в свободное место, держим
    await page.waitForTimeout(450); // дать пружинам собрать ряд
    const { ys, xs } = await rowXOrder(page, [cA!, c6!, c8!]);
    await page.mouse.up();

    const dy = Math.max(...ys) - Math.min(...ys);
    expect(dy).toBeLessThan(12); // одна строка
    expect(xs[0]).toBeLessThan(xs[1]!); // A♦ < 6♣ < 8♥ по нажатию
    expect(xs[1]).toBeLessThan(xs[2]!);
  });

  test("сборка «по масти»: тот же набор в ряд по ♣<♦<♥", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, h.selFormAt[2]!); // форма: ряд
    await clickAt(page, h.selSortAt[2]!); // сорт: масть (override)
    await clickAt(page, h.selectionState.selectToggleAt!);
    h = await hooks(page);
    expect(h.selectionState.assembly.sortOverride).toBe("suit");

    const [cA, c6, c8] = await selectByIdx(page, [3, 1, 2]); // выбрали A♦(♦), 6♣(♣), 8♥(♥)
    const box = (await page.locator("canvas").boundingBox())!;
    const p = h.selFigures[3]!;
    await page.mouse.move(box.x + p.x, box.y + p.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 250, box.y + 300, { steps: 12 });
    await page.waitForTimeout(450);
    // по масти ♣<♦<♥: 6♣ слева, A♦ середина, 8♥ справа
    const { xs } = await rowXOrder(page, [c6!, cA!, c8!]);
    await page.mouse.up();
    expect(xs[0]).toBeLessThan(xs[1]!);
    expect(xs[1]).toBeLessThan(xs[2]!);
  });

  test("override перебивает естественный порядок: order=выбор, но сорт=номинал → порядок по рангу", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, h.selFormAt[2]!); // форма: ряд
    await clickAt(page, h.selOrderAt[1]!); // порядок: выбор (естественный = по нажатию)
    await clickAt(page, h.selSortAt[1]!); // сорт: номинал (override ПОВЕРХ выбора)
    await clickAt(page, h.selectionState.selectToggleAt!);
    h = await hooks(page);
    expect(h.selectionState.assembly.order).toBe("selection");
    expect(h.selectionState.assembly.sortOverride).toBe("rank"); // override перебивает

    const [cA, c6, c8] = await selectByIdx(page, [3, 1, 2]); // A♦=14, 6♣=6, 8♥=8
    const box = (await page.locator("canvas").boundingBox())!;
    const p = h.selFigures[3]!;
    await page.mouse.move(box.x + p.x, box.y + p.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 250, box.y + 300, { steps: 12 });
    await page.waitForTimeout(450);
    // по рангу 6<8<14: 6♣ слева, 8♥ середина, A♦ справа
    const { xs } = await rowXOrder(page, [c6!, c8!, cA!]);
    await page.mouse.up();
    expect(xs[0]).toBeLessThan(xs[1]!);
    expect(xs[1]).toBeLessThan(xs[2]!);
  });

  // Пресет-рычаг: выбор пресета «sorted-row» (индекс 3) выставляет весь конфиг разом (form=row,
  // sortOverride=rank) и пересинхронивает остальные тумблеры — конфиг читается из хука assembly.
  test("пресет sorted-row: выставляет form=row + sortOverride=rank разом", async ({ page }) => {
    const h = await hooks(page);
    expect(h.selectionState.assembly.preset).toBe("grab-to-hand"); // дефолт
    expect(h.selectionState.assembly.form).toBe("stack-tight");
    await clickAt(page, h.selPresetAt[3]!); // пресет: sorted-row
    await page.waitForTimeout(150);
    const g = await hooks(page);
    expect(g.selectionState.assembly.preset).toBe("sorted-row");
    expect(g.selectionState.assembly.form).toBe("row");
    expect(g.selectionState.assembly.order).toBe("proximity");
    expect(g.selectionState.assembly.sortOverride).toBe("rank");
  });

  // ——— отбор-визуал: eligible / mark / hintEligible (issue #60) ———
  // Индексы selFigures = порядок слотов: 0=10♠, 1=6♣, 2=8♥, 3=A♦(♦, единственная буби), 4=7♣, 5=Q♠.
  const stateOf = (page: Page, id: string): Promise<string> =>
    page.evaluate((cid) => (window as unknown as { __fd: { byId: Map<string, { state: string }> } }).__fd.byId.get(cid)!.state, id);

  test("выбор: буби — в набор берётся только A♦, не-буби не выделяется", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, h.selEligibleAt[1]!); // выбор: буби (eligible=diamonds)
    await page.waitForTimeout(120);
    await clickAt(page, h.selectionState.selectToggleAt!);
    h = await hooks(page);
    expect(h.selectionState.visual.eligible).toBe("diamonds");

    await clickAt(page, h.selFigures[0]!); // 10♠ — не буби, взять НЕ должно
    let g = await hooks(page);
    expect(g.selectionState.selected).toEqual([]);

    const diamond = h.selFigures[3]!; // A♦
    await clickAt(page, diamond);
    g = await hooks(page);
    expect(g.selectionState.selected).toEqual([diamond.id]); // только буби вошла
  });

  test("метка: контур — выделенная в контуре и НЕ поднята (idle); подъём — поднята без контура; оба — и то, и то", async ({ page }) => {
    // контур: только рамка, карта на столе (idle)
    let h = await hooks(page);
    await clickAt(page, h.selMarkAt[1]!); // метка: контур
    await clickAt(page, h.selectionState.selectToggleAt!);
    h = await hooks(page);
    expect(h.selectionState.visual.mark).toBe("outline");
    await clickAt(page, h.selFigures[0]!);
    let g = await hooks(page);
    let f = g.selFigures[0]!;
    expect(f.outlined).toBe(true);
    expect(await stateOf(page, f.id)).toBe("idle"); // НЕ поднята

    // подъём: floating без контура
    await page.goto("/playground");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    h = await hooks(page);
    await clickAt(page, h.selMarkAt[0]!); // метка: подъём
    await clickAt(page, h.selectionState.selectToggleAt!);
    h = await hooks(page);
    expect(h.selectionState.visual.mark).toBe("lift");
    await clickAt(page, h.selFigures[0]!);
    g = await hooks(page);
    f = g.selFigures[0]!;
    expect(f.outlined).toBe(false);
    expect(await stateOf(page, f.id)).toBe("floating"); // поднята

    // дефолт «оба»: и контур, и подъём
    await page.goto("/playground");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    h = await hooks(page);
    expect(h.selectionState.visual.mark).toBe("both"); // дефолт
    await clickAt(page, h.selectionState.selectToggleAt!);
    h = await hooks(page);
    await clickAt(page, h.selFigures[0]!);
    g = await hooks(page);
    f = g.selFigures[0]!;
    expect(f.outlined).toBe(true);
    expect(await stateOf(page, f.id)).toBe("floating");
  });

  test("подсказка: вкл — выбираемые-невыбранные подсвечены (hinted); выкл — ни одной подсказки", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, h.selHintAt[1]!); // подсказка: вкл
    await clickAt(page, h.selectionState.selectToggleAt!);
    h = await hooks(page);
    expect(h.selectionState.visual.hintEligible).toBe(true);

    await clickAt(page, h.selFigures[0]!); // выбрали одну → у остальных выбираемых должна зажечься подсказка
    let g = await hooks(page);
    const picked = g.selFigures.find((f) => f.selected)!;
    const others = g.selFigures.filter((f) => !f.selected);
    expect(picked.hinted).toBe(false); // сама выбранная — не подсказка (она выделена)
    expect(others.every((f) => f.hinted)).toBe(true); // все выбираемые-невыбранные подсвечены (eligible=cards по дефолту)

    await clickAt(page, g.selHintAt[0]!); // подсказка: выкл
    g = await hooks(page);
    expect(g.selectionState.visual.hintEligible).toBe(false);
    expect(g.selFigures.some((f) => f.hinted)).toBe(false); // подсказок не осталось
  });

  // ——— дроп набора МИМО зон: политика onDropOutside (issue #61) ———
  // Выбираем 2 фигуры (слоты 0,0 и 0,1 — верх-лево), тащим набор ЗА пределы борд-зоны и отпускаем.
  // Драг клампится рамкой зоны (boardZoneOf → clamp), поэтому «оставленные» карты оседают у КРАЯ
  // зоны (не строго в точке пальца), а dropSetAt получает реальную точку СНАРУЖИ → moved=false →
  // ветка onDropOutside. Инвариант, который проверяем: домой → назад к исходным слотам; остаться/
  // распустить → НЕ домой (уехали и осели), плюс сохранение/сброс выделения.
  const dropSetOutside = async (page: Page, policyIdx: number) => {
    let h = await hooks(page);
    if (policyIdx !== 0) await clickAt(page, h.selDropOutsideAt[policyIdx]!); // 0=домой (дефолт), 1=остаться, 2=распустить
    await clickAt(page, h.selectionState.selectToggleAt!); // войти в режим
    h = await hooks(page);
    await clickAt(page, h.selFigures[0]!); // слот 0,0 (10♠)
    await clickAt(page, h.selFigures[1]!); // слот 0,1 (6♣)
    h = await hooks(page);
    expect(h.selectionState.selected).toHaveLength(2);
    const selected = h.selFigures.filter((f) => f.selected);
    const homes = new Map(selected.map((f) => [f.id, { x: f.x, y: f.y }])); // позиция покоя = дом
    const b = selBoard(h);
    const xs = b.slots.map((s) => s.x);
    const ys = b.slots.map((s) => s.y);
    const release = { x: Math.max(...xs) + h.cardW * 2, y: Math.max(...ys) + h.cardW * 2 }; // за низ-право борда

    const box = (await page.locator("canvas").boundingBox())!;
    const start = selected[0]!; // старт драга за выделенную → это ДРАГ НАБОРА
    await page.mouse.move(box.x + start.x, box.y + start.y);
    await page.mouse.down();
    await page.mouse.move(box.x + release.x, box.y + release.y, { steps: 14 });
    await page.waitForTimeout(450); // дать набору доехать до клампнутой позиции у края зоны
    await page.mouse.up();
    await page.waitForTimeout(900); // осесть пружинами (без клампа набор летит дальше → дольше возврат)
    return { homes, ids: selected.map((f) => f.id) };
  };
  const figById = (h: Hooks, id: string) => h.selFigures.find((f) => f.id === id)!;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  test("мимо зон «домой»: набор возвращается на исходные слоты, остаётся выделенным", async ({ page }) => {
    const { homes, ids } = await dropSetOutside(page, 0);
    const g = await hooks(page);
    expect(g.selectionState.policy.onDropOutside).toBe("return-home");
    for (const id of ids) {
      const f = figById(g, id);
      expect(dist(f, homes.get(id)!)).toBeLessThan(14); // ≈ исходный слот
      expect(f.selected).toBe(true); // выделение сохранено
    }
  });

  test("мимо зон «остаться»: набор оседает не дома, остаётся выделенным", async ({ page }) => {
    const { homes, ids } = await dropSetOutside(page, 1);
    const g = await hooks(page);
    expect(g.selectionState.policy.onDropOutside).toBe("stay");
    for (const id of ids) {
      const f = figById(g, id);
      expect(dist(f, homes.get(id)!)).toBeGreaterThan(g.cardW); // уехал от дома и осел там
      expect(f.selected).toBe(true); // всё ещё в наборе
    }
  });

  test("мимо зон «распустить»: набор оседает не дома И выделение снято", async ({ page }) => {
    const { homes, ids } = await dropSetOutside(page, 2);
    const g = await hooks(page);
    expect(g.selectionState.policy.onDropOutside).toBe("dissolve");
    expect(g.selectionState.selected).toEqual([]); // набор распущен
    for (const id of ids) {
      const f = figById(g, id);
      expect(dist(f, homes.get(id)!)).toBeGreaterThan(g.cardW); // осел не дома
      expect(f.selected).toBe(false); // ни одна не выделена
      expect(f.outlined).toBe(false); // контур снят вместе с выделением (не осталось золотых рамок)
    }
  });

  // ——— лог-дропбокс «называю масть» (issue #62) ———
  // Индексы selFigures = порядок слотов: 0=10♠, 1=6♣, 2=8♥, 3=A♦, 4=7♣, 5=Q♠, 6=джокер (без масти).
  // Тащим выбранный набор на бокс СПРАВА от борда (демо анкламплен) — бокс чисто логирует уникальные
  // масти и НИЧЕГО не хранит: карты возвращаются домой, выделение сохраняется (можно называть снова).
  const dropOnNameBox = async (page: Page, idxs: number[]) => {
    let h = await hooks(page);
    await clickAt(page, h.selectionState.selectToggleAt!); // войти в режим
    h = await hooks(page);
    for (const i of idxs) await clickAt(page, h.selFigures[i]!);
    h = await hooks(page);
    const selected = h.selFigures.filter((f) => f.selected);
    const homes = new Map(selected.map((f) => [f.id, { x: f.x, y: f.y }]));
    const boxPt = h.zones["называю масть"]!;
    const box = (await page.locator("canvas").boundingBox())!;
    const start = selected[0]!; // старт с выделенной → это ДРАГ НАБОРА
    await page.mouse.move(box.x + start.x, box.y + start.y);
    await page.mouse.down();
    await page.mouse.move(box.x + boxPt.x, box.y + boxPt.y, { steps: 14 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(900); // осесть (без клампа набор летит дальше → дольше возврат домой)
    return { homes, ids: selected.map((f) => f.id) };
  };

  test("называю масть: дедуп — весь набор пик выписан один раз «Пики», карты домой", async ({ page }) => {
    const { homes, ids } = await dropOnNameBox(page, [0, 5]); // 10♠ + Q♠ — обе пики
    const g = await hooks(page);
    expect(g.lastNamedSuits).toEqual(["Пики"]); // без повтора
    expect(g.selectionState.selected).toHaveLength(2); // бокс не хранит/не гасит — выделение осталось
    for (const id of ids) expect(dist(figById(g, id), homes.get(id)!)).toBeLessThan(14); // вернулись домой
  });

  test("называю масть: несколько мастей + джокер → уникальные масти и «???»", async ({ page }) => {
    const { ids } = await dropOnNameBox(page, [0, 2, 6]); // 10♠ + 8♥ + джокер
    const g = await hooks(page);
    // порядок мастей зависит от порядка сборки набора — сверяем состав (уникальные масти + один «???»).
    expect([...g.lastNamedSuits].sort()).toEqual(["???", "Пики", "Черви"].sort());
    expect(ids).toHaveLength(3);
  });

  test("называю масть: только джокер → один «???»", async ({ page }) => {
    await dropOnNameBox(page, [6]); // джокер (card без масти)
    const g = await hooks(page);
    expect(g.lastNamedSuits).toEqual(["???"]);
  });

  // Бокс принимает карты и ВНЕ селекта: одиночную карту БОРДА (режим выделения ВЫКЛ) тоже логирует —
  // раньше она уходила в bz.dropAt, минуя бокс (в отличие от standalone-карт/стопок).
  test("называю масть: одиночная карта борда без выделения тоже выводит масть", async ({ page }) => {
    const h = await hooks(page); // режим НЕ включаем
    const card = h.selFigures[0]!; // 10♠
    const boxPt = h.zones["называю масть"]!;
    await dragTo(page, card, boxPt); // просто драг карты на бокс
    await page.waitForTimeout(300);
    const g = await hooks(page);
    expect(g.lastNamedSuits).toEqual(["Пики"]);
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
