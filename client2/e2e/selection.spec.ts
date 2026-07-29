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
      trigger: "off" | "hold" | "tap";
      selected: string[];
      resetButtonAt: { x: number; y: number } | null;
      assembly: {
        preset?: string;
        form: "stack-tight" | "stack-open" | "row" | "fan";
        order: "proximity" | "selection" | "append";
        sortOverride: "none" | "rank" | "suit" | "center";
      };
      visual: { eligible: "cards" | "diamonds" | "any"; hintEligible: boolean; mark: "lift" | "outline" | "both" };
      policy: { merge: "off" | "on" | "custom"; keepSelection: "off" | "on" | "custom"; mergeAnchor: "primary" };
    };
    perf: { hoverRerenders: number };
    selMergeAt: { x: number; y: number }[];
    selKeepAt: { x: number; y: number }[];
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
  // Вход в выделение теперь через КАРТУ (#66). Для большинства тестов ставим режим «по нажатию»
  // (selMultiAt[2]) — тогда тап по фигуре выбирает её и открывает сессию (как прежний вход + выбор).
  const enter = async (page: Page) => {
    const h = await hooks(page);
    await clickAt(page, h.selMultiAt[2]!); // «по нажатию»
  };

  test.beforeEach(async ({ page }) => {
    await page.goto("/playground");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  });

  // Долгое удержание фигуры без сдвига (для hold-mode входа, #66).
  const longPress = async (page: Page, p: { x: number; y: number }, ms = 600) => {
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + p.x, box.y + p.y);
    await page.mouse.down();
    await page.waitForTimeout(ms);
    await page.mouse.up();
    await page.waitForTimeout(150);
  };

  // Три способа входа (#66). «по нажатию»: тап по подходящей карте открывает сессию и выбирает её;
  // сессия активна ⇔ набор непуст; кнопка сброса появляется при ≥1.
  test("вход «по нажатию»: тап по карте открывает сессию и выбирает; кнопка сброса появляется", async ({ page }) => {
    let h = await hooks(page);
    expect(h.selectionState.active).toBe(false);
    expect(h.selectionState.trigger).toBe("off");
    expect(h.selectionState.resetButtonAt).toBeNull();

    await clickAt(page, h.selMultiAt[2]!); // «по нажатию»
    h = await hooks(page);
    expect(h.selectionState.trigger).toBe("tap");
    expect(h.selectionState.active).toBe(false); // тумблер задаёт триггер, но сессия ещё не открыта
    expect(h.selectionState.resetButtonAt).toBeNull();

    await clickAt(page, h.selFigures[0]!); // тап по карте → вход + выбор
    h = await hooks(page);
    expect(h.selectionState.active).toBe(true);
    expect(h.selectionState.selected).toEqual([h.selFigures[0]!.id]);
    expect(h.selectionState.resetButtonAt).not.toBeNull();
  });

  test("вход «по зажатию»: быстрый тап НЕ входит; удержание входит и выбирает; дальше тап добавляет", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, h.selMultiAt[1]!); // «по зажатию»
    h = await hooks(page);
    expect(h.selectionState.trigger).toBe("hold");

    await clickAt(page, h.selFigures[0]!); // быстрый тап — вход НЕ должен сработать
    h = await hooks(page);
    expect(h.selectionState.active).toBe(false);
    expect(h.selectionState.selected).toEqual([]);

    await longPress(page, h.selFigures[0]!); // удержание → вход + выбор
    h = await hooks(page);
    expect(h.selectionState.active).toBe(true);
    expect(h.selectionState.selected).toEqual([h.selFigures[0]!.id]);

    await clickAt(page, h.selFigures[1]!); // в сессии тап добавляет (зажатие — только вход)
    h = await hooks(page);
    expect(h.selectionState.selected.sort()).toEqual([h.selFigures[0]!.id, h.selFigures[1]!.id].sort());
  });

  test("режим «выкл»: тап по карте ничего не выделяет", async ({ page }) => {
    const h = await hooks(page); // дефолт off
    expect(h.selectionState.trigger).toBe("off");
    await clickAt(page, h.selFigures[0]!);
    const g = await hooks(page);
    expect(g.selectionState.active).toBe(false);
    expect(g.selectionState.selected).toEqual([]);
  });

  test("пустой набор = выход из сессии: снял последнюю → active false", async ({ page }) => {
    await enter(page); // по нажатию
    let h = await hooks(page);
    await clickAt(page, h.selFigures[0]!); // выбрал → сессия открыта
    h = await hooks(page);
    expect(h.selectionState.active).toBe(true);
    await clickAt(page, h.selFigures[0]!); // снял ту же → набор пуст
    h = await hooks(page);
    expect(h.selectionState.selected).toEqual([]);
    expect(h.selectionState.active).toBe(false); // сессия закрыта
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
    expect(g.selectionState.selected).toEqual([]); // набор ушёл в слот → пуст
    expect(g.selectionState.active).toBe(false); // пустой набор = выход из сессии (#66)
  });

  // Тап-снятие выделения НЕ должен дёргать остальные карты (issue #65): набор трогается лишь когда
  // ведущая карта реально поехала (палец за порогом тапа), а не на касании/снятии. Хелпер: касание
  // ведущей карты с опциональным субпороговым сдвигом, проверка что СОСЕД не шелохнулся.
  const tapDeselectKeepsNeighborStill = async (page: Page, jitter: number) => {
    await enter(page);
    let h = await hooks(page);
    await clickAt(page, h.selFigures[0]!); // 10♠
    await clickAt(page, h.selFigures[1]!); // 6♣ — сосед, его позицию стережём
    h = await hooks(page);
    expect(h.selectionState.selected).toHaveLength(2);
    const neighborId = h.selFigures[1]!.id;
    const nBefore = h.selFigures.find((f) => f.id === neighborId)!;
    const home = { x: nBefore.x, y: nBefore.y };
    const lead = h.selFigures[0]!;
    const box = (await page.locator("canvas").boundingBox())!;

    await page.mouse.move(box.x + lead.x, box.y + lead.y);
    await page.mouse.down();
    if (jitter) await page.mouse.move(box.x + lead.x + jitter, box.y + lead.y, { steps: 3 }); // субпороговый (<8px)
    await page.waitForTimeout(220); // за это время старый код успел бы стянуть соседа к пальцу
    const during = (await hooks(page)).selFigures.find((f) => f.id === neighborId)!;
    expect(Math.hypot(during.x - home.x, during.y - home.y)).toBeLessThan(3); // сосед стоит НА МЕСТЕ во время касания
    await page.mouse.up();
    await page.waitForTimeout(220);

    const after = await hooks(page);
    expect(after.selectionState.selected).toEqual([neighborId]); // ведущую сняли тапом
    const nAfter = after.selFigures.find((f) => f.id === neighborId)!;
    expect(Math.hypot(nAfter.x - home.x, nAfter.y - home.y)).toBeLessThan(3); // и после — сосед не сдвинулся
  };

  test("тап-снятие (без сдвига) не двигает остальные карты набора (#65)", async ({ page }) => {
    await tapDeselectKeepsNeighborStill(page, 0);
  });

  test("тап-снятие с субпороговым дрожанием (<8px) тоже не двигает соседей (#65)", async ({ page }) => {
    await tapDeselectKeepsNeighborStill(page, 5);
  });

  // Выход из режима (тоггл «выделение: выкл») гасит набор и прячет кнопку сброса.
  test("выход из режима: тоггл выкл → active=false, набор сброшен, кнопка сброса скрыта", async ({ page }) => {
    await enter(page);
    let h = await hooks(page);
    await clickAt(page, h.selFigures[0]!); // выбрали одну → кнопка сброса появилась
    h = await hooks(page);
    expect(h.selectionState.resetButtonAt).not.toBeNull();
    await clickAt(page, h.selMultiAt[0]!); // «выделение: выкл» — выход
    h = await hooks(page);
    expect(h.selectionState.trigger).toBe("off");
    expect(h.selectionState.active).toBe(false);
    expect(h.selectionState.selected).toEqual([]); // набор сброшен на выходе
    expect(h.selectionState.resetButtonAt).toBeNull(); // кнопка сброса скрыта
  });

  // Кнопка сброса гасит набор; пустой набор = выход из сессии (#66).
  test("кнопка сброса: клик гасит набор и закрывает сессию", async ({ page }) => {
    await enter(page);
    let h = await hooks(page);
    await clickAt(page, h.selFigures[0]!);
    await clickAt(page, h.selFigures[1]!);
    h = await hooks(page);
    expect(h.selectionState.selected).toHaveLength(2);
    await clickAt(page, h.selectionState.resetButtonAt!); // сброс
    h = await hooks(page);
    expect(h.selectionState.selected).toEqual([]); // набор пуст
    expect(h.selectionState.active).toBe(false); // пустой набор → сессия закрыта (#66)
    expect(h.selectionState.resetButtonAt).toBeNull(); // и кнопка снова скрыта
  });

  // Вне сессии драг карты тащит ОДНУ карту (не выделяет), в т.ч. в режиме «по нажатию» (#66).
  test("вне сессии: драг карты тащит одну карту, не открывает выделение", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, h.selMultiAt[2]!); // «по нажатию», но сессия ещё не открыта
    h = await hooks(page);
    const b = selBoard(h);
    const f0 = h.selFigures[0]!;
    const empty = b.slots.find((s) => s.key === "0,3")!;
    await dragTo(page, f0, empty); // драг (палец за порогом) — не вход
    await page.waitForTimeout(500);
    const g = await hooks(page);
    expect(g.selectionState.active).toBe(false); // выделение НЕ открылось
    expect(g.selectionState.selected).toEqual([]);
    const sb = g.boards.find((x) => x.title.includes("выделение"))!;
    expect(sb.figures.find((f) => f.id === f0.id)!.key).toBe("0,3"); // карта переехала одна
  });

  // Override по НОМИНАЛУ: включаем «сорт: номинал» (sortOverride=rank) — набор выносится [6,8,10].
  test("сорт по номиналу: набор [10,8,6] выносится как [6,8,10]", async ({ page }) => {
    let h = await hooks(page);
    await clickAt(page, h.selSortAt[1]!); // сорт: номинал (override)
    await page.waitForTimeout(150);
    await clickAt(page, h.selMultiAt[2]!);
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
    await clickAt(page, h.selMultiAt[2]!);
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
    await clickAt(page, h.selMultiAt[2]!);
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
    await clickAt(page, h.selMultiAt[2]!);
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
    await clickAt(page, h.selMultiAt[2]!);
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
    expect(h.selectionState.assembly.preset).toBe("drag-start"); // дефолт (issue #74: имя схемы drag-start = grab-to-hand)
    expect(h.selectionState.assembly.form).toBe("stack-tight");
    await clickAt(page, h.selPresetAt[4]!); // пресет: sorted-row (issue #74: индекс сдвинулся — drag-start/follow-first/follow-last теперь первыми)
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
    await clickAt(page, h.selMultiAt[2]!);
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
    await clickAt(page, h.selMultiAt[2]!);
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
    await clickAt(page, h.selMultiAt[2]!);
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
    await clickAt(page, h.selMultiAt[2]!);
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
    await clickAt(page, h.selMultiAt[2]!);
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

  // ——— дроп набора МИМО зон: две оси merge + keepSelection (issue #63) ———
  // Демо-борд анкламплен (#62): набор реально уезжает в точку пальца ЗА рамку борда, dropSetAt снаружи
  // → moved=false → ветка двух осей. Тумблеры: «сшивать» [нет/да/только ♣] (default нет), «выделение
  // после» [да/нет/только ♦] (default да). Инвариант: merge решает сшивку (осел НЕ дома) vs дом,
  // keepSelection — остаётся ли карта выделенной. Оси per-card (custom смотрит масть карты).
  const dropSetOutside = async (page: Page, opts: { merge?: number; keep?: number; figs?: number[] } = {}) => {
    let h = await hooks(page);
    if (opts.merge) await clickAt(page, h.selMergeAt[opts.merge]!); // 0=нет(default) 1=да 2=только ♣
    if (opts.keep) await clickAt(page, h.selKeepAt[opts.keep]!); // 0=да(default) 1=нет 2=только ♦
    await clickAt(page, h.selMultiAt[2]!); // войти в режим
    h = await hooks(page);
    const figs = opts.figs ?? [0, 1]; // по умолчанию 10♠ + 6♣
    for (const i of figs) await clickAt(page, h.selFigures[i]!);
    h = await hooks(page);
    expect(h.selectionState.selected).toHaveLength(figs.length);
    const selected = figs.map((i) => h.selFigures[i]!); // в порядке слотов (id стабильны)
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
    await page.waitForTimeout(450);
    await page.mouse.up();
    await page.waitForTimeout(900); // осесть пружинами (без клампа набор летит дальше → дольше возврат)
    return { homes, ids: selected.map((f) => f.id) };
  };
  const figById = (h: Hooks, id: string) => h.selFigures.find((f) => f.id === id)!;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  test("мимо зон — дефолт (merge off, keep on): набор домой, остаётся выделенным", async ({ page }) => {
    const { homes, ids } = await dropSetOutside(page); // дефолты
    const g = await hooks(page);
    expect(g.selectionState.policy).toMatchObject({ merge: "off", keepSelection: "on", mergeAnchor: "primary" });
    for (const id of ids) {
      const f = figById(g, id);
      expect(dist(f, homes.get(id)!)).toBeLessThan(14); // ≈ исходный слот
      expect(f.selected).toBe(true); // выделение сохранено
    }
  });

  // merge=on: сшитые карты СОБИРАЮТСЯ стопкой на слот-дом ведущей (primary), не оседают в точке дропа
  // (issue #67). primary — на своём доме (~0), не-primary переезжает туда же; обе стоят стопкой рядом.
  test("мимо зон сшить (merge on): набор собирается стопкой на дом primary, остаётся выделенным", async ({ page }) => {
    const { homes, ids } = await dropSetOutside(page, { merge: 1 }); // 10♠ + 6♣, обе сшиваются
    const g = await hooks(page);
    expect(g.selectionState.policy.merge).toBe("on");
    const f0 = figById(g, ids[0]!);
    const f1 = figById(g, ids[1]!);
    const d0 = dist(f0, homes.get(ids[0]!)!);
    const d1 = dist(f1, homes.get(ids[1]!)!);
    expect(Math.min(d0, d1)).toBeLessThan(14); // primary — на своём слот-доме
    expect(Math.max(d0, d1)).toBeGreaterThan(g.cardW); // не-primary — переехала на дом primary
    expect(dist(f0, f1)).toBeLessThan(g.cardW); // сшиты тесной стопкой рядом
    for (const id of ids) expect(figById(g, id).selected).toBe(true);
  });

  test("мимо зон сшить + снять выделение (merge on, keep off): стопка на дом primary И выделение снято", async ({ page }) => {
    const { homes, ids } = await dropSetOutside(page, { merge: 1, keep: 1 });
    const g = await hooks(page);
    expect(g.selectionState.policy).toMatchObject({ merge: "on", keepSelection: "off" });
    expect(g.selectionState.selected).toEqual([]); // набор распущен
    const f0 = figById(g, ids[0]!);
    const f1 = figById(g, ids[1]!);
    const d0 = dist(f0, homes.get(ids[0]!)!);
    const d1 = dist(f1, homes.get(ids[1]!)!);
    expect(Math.min(d0, d1)).toBeLessThan(14); // primary — на своём доме
    expect(Math.max(d0, d1)).toBeGreaterThan(g.cardW); // не-primary переехала
    expect(dist(f0, f1)).toBeLessThan(g.cardW); // сшиты стопкой
    for (const id of ids) {
      expect(figById(g, id).selected).toBe(false);
      expect(figById(g, id).outlined).toBe(false);
    }
  });

  test("мимо зон merge=custom «только ♣»: клубы сшиты стопкой на дом primary-клуба, остальные домой", async ({ page }) => {
    const { homes, ids } = await dropSetOutside(page, { merge: 2, figs: [1, 4, 0] }); // 6♣ + 7♣ + 10♠
    const g = await hooks(page);
    expect(g.selectionState.policy.merge).toBe("custom");
    expect(dist(figById(g, ids[2]!), homes.get(ids[2]!)!)).toBeLessThan(14); // 10♠ — не ♣ → домой
    const c0 = figById(g, ids[0]!); // 6♣
    const c1 = figById(g, ids[1]!); // 7♣
    expect(dist(c0, c1)).toBeLessThan(g.cardW); // два клуба — сшиты стопкой рядом
    const dc0 = dist(c0, homes.get(ids[0]!)!);
    const dc1 = dist(c1, homes.get(ids[1]!)!);
    expect(Math.min(dc0, dc1)).toBeLessThan(14); // primary-клуб на своём доме
    expect(Math.max(dc0, dc1)).toBeGreaterThan(g.cardW); // другой клуб переехал на дом primary
  });

  test("мимо зон keep=custom «только ♦»: выделение остаётся лишь у бубны", async ({ page }) => {
    const { ids } = await dropSetOutside(page, { keep: 2, figs: [0, 3] }); // 10♠ + A♦
    const g = await hooks(page);
    expect(g.selectionState.policy.keepSelection).toBe("custom");
    expect(g.selectionState.selected).toEqual([ids[1]!]); // только A♦
    expect(figById(g, ids[0]!).selected).toBe(false); // 10♠ снят
    expect(figById(g, ids[1]!).selected).toBe(true); // A♦ остался
  });

  // ——— лог-дропбокс «называю масть» (issue #62) ———
  // Индексы selFigures = порядок слотов: 0=10♠, 1=6♣, 2=8♥, 3=A♦, 4=7♣, 5=Q♠, 6=джокер (без масти).
  // Тащим выбранный набор на бокс СПРАВА от борда (демо анкламплен) — бокс чисто логирует уникальные
  // масти и НИЧЕГО не хранит: карты возвращаются домой, выделение сохраняется (можно называть снова).
  const dropOnNameBox = async (page: Page, idxs: number[]) => {
    let h = await hooks(page);
    await clickAt(page, h.selMultiAt[2]!); // войти в режим
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

  // ——— gather-на-селект: три именованные схемы (issue #74) ———
  // selPresetAt порядок = UI-порядок ["драг","1-я","послед.","лоток","ряд↑"] → индексы 0/1/2.
  test.describe("три пресета сборки (issue #74)", () => {
    test("drag-start (дефолт): выбор БЕЗ драга карты не двигает — старое поведение не меняется", async ({ page }) => {
      let h = await hooks(page);
      expect(h.selectionState.assembly.preset).toBe("drag-start");
      await clickAt(page, h.selMultiAt[2]!); // вход «по нажатию»
      h = await hooks(page);
      const before = [h.selFigures[0]!, h.selFigures[1]!].map((f) => ({ id: f.id, x: f.x, y: f.y }));

      await clickAt(page, h.selFigures[0]!);
      await clickAt(page, h.selFigures[1]!);
      await page.waitForTimeout(300);

      const g = await hooks(page);
      for (const b of before) {
        const now = figById(g, b.id);
        expect(dist(now, b)).toBeLessThan(2); // никуда не поехала — сборка ждёт старта драга
      }
    });

    test("follow-first: первая выбранная стоит на месте, вторая летит и пристраивается к ней", async ({ page }) => {
      let h = await hooks(page);
      await clickAt(page, h.selPresetAt[1]!); // «1-я» = follow-first
      h = await hooks(page);
      expect(h.selectionState.assembly.preset).toBe("follow-first");
      expect(h.selectionState.assembly.gatherOn).toBe("select-each");
      expect(h.selectionState.assembly.anchor).toBe("first");
      await clickAt(page, h.selMultiAt[2]!); // вход «по нажатию»
      h = await hooks(page);

      const first0 = h.selFigures[0]!;
      const second0 = h.selFigures[1]!;
      await clickAt(page, first0); // 1-й выбор — сессия открыта, карта на своём месте
      let g = await hooks(page);
      expect(dist(figById(g, first0.id), first0)).toBeLessThan(2); // якорь не двигается

      await clickAt(page, second0); // 2-й выбор — ДОЛЖЕН полететь СРАЗУ, без драга
      await page.waitForTimeout(450); // дать пружине долететь
      g = await hooks(page);
      const firstNow = figById(g, first0.id);
      const secondNow = figById(g, second0.id);
      expect(dist(firstNow, first0)).toBeLessThan(2); // якорь (первая) так и не сдвинулся
      expect(dist(secondNow, second0)).toBeGreaterThan(10); // вторая уехала со своего слота
      expect(dist(secondNow, firstNow)).toBeLessThan(g.cardW * 0.15); // и пристроилась вплотную к первой
    });

    test("follow-last: стопка гоняется за новейшей выбранной", async ({ page }) => {
      let h = await hooks(page);
      await clickAt(page, h.selPresetAt[2]!); // «послед.» = follow-last
      h = await hooks(page);
      expect(h.selectionState.assembly.preset).toBe("follow-last");
      expect(h.selectionState.assembly.gatherOn).toBe("select-each");
      expect(h.selectionState.assembly.anchor).toBe("latest");
      await clickAt(page, h.selMultiAt[2]!); // вход «по нажатию»
      h = await hooks(page);

      const first0 = h.selFigures[0]!;
      const second0 = h.selFigures[1]!;
      await clickAt(page, first0); // 1-й выбор
      await clickAt(page, second0); // 2-й выбор → он становится новым якорем; первая подтягивается к нему
      await page.waitForTimeout(450);

      const g = await hooks(page);
      const firstNow = figById(g, first0.id);
      const secondNow = figById(g, second0.id);
      expect(dist(secondNow, second0)).toBeLessThan(2); // новейшая (якорь) осталась на своём месте
      expect(dist(firstNow, first0)).toBeGreaterThan(10); // первая уехала со своего исходного слота
      expect(dist(firstNow, secondNow)).toBeLessThan(g.cardW * 0.15); // и подтянулась к новейшей
    });

    test("follow-first и follow-last дают РАЗНУЮ раскладку на одном и том же выборе", async ({ page }) => {
      const run = async (presetIdx: number) => {
        await page.goto("/playground");
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(600);
        let h = await hooks(page);
        await clickAt(page, h.selPresetAt[presetIdx]!);
        await clickAt(page, h.selMultiAt[2]!);
        h = await hooks(page);
        await clickAt(page, h.selFigures[0]!);
        await clickAt(page, h.selFigures[1]!);
        await page.waitForTimeout(450);
        const g = await hooks(page);
        return { first: figById(g, h.selFigures[0]!.id), second: figById(g, h.selFigures[1]!.id) };
      };
      const firstRun = await run(1); // follow-first
      const lastRun = await run(2); // follow-last
      // В follow-first стопка стоИт на первой карте; в follow-last — на второй. Разные абсолютные
      // позиции якоря → видимо разное поведение (issue #74 приёмка).
      expect(dist(firstRun.first, lastRun.first)).toBeGreaterThan(5);
    });
  });
});
