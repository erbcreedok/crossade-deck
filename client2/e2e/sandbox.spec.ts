import { test, expect } from "@playwright/test";

// Песочница: движок рисует карты/тени, вьюпорт зумит и панится (поведение движка в целом).
test.describe("песочница", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/free-desk");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  });

  test("канвас отрисован — много графики (карты, тени, текст)", async ({ page }) => {
    await expect(page.locator("canvas")).toBeVisible();
    const shot = await page.screenshot();
    expect(shot.length).toBeGreaterThan(20000); // полная сцена >> пустого фона
  });

  test("зум колесом с Ctrl меняет масштаб вьюпорта", async ({ page }) => {
    const zoomInput = page.locator(".fd-zoom input");
    await expect(zoomInput).toHaveValue("1");
    await page.mouse.move(250, 400);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -300);
    await page.keyboard.up("Control");
    await page.waitForTimeout(150);
    const z = Number(await zoomInput.inputValue());
    expect(z).toBeGreaterThan(1.1); // приблизили
  });

  test("пан колесом двигает вертикальный скролл", async ({ page }) => {
    const thumb = page.locator(".fd-scrollbar-y .fd-scrollbar-thumb");
    const top0 = await thumb.evaluate((e: HTMLElement) => e.style.top).catch(() => "0%");
    await page.mouse.move(250, 400);
    await page.mouse.wheel(0, 500); // пан вниз (без модификатора)
    await page.waitForTimeout(200);
    const top1 = await thumb.evaluate((e: HTMLElement) => e.style.top);
    expect(top1).not.toBe(top0);
    expect(parseFloat(top1)).toBeGreaterThan(0);
  });

  test("драг карты меняет сцену (тень/позиция едут)", async ({ page }) => {
    const clip = { x: 0, y: 80, width: 260, height: 200 }; // первый ряд карт
    const before = await page.screenshot({ clip });
    // тащим первую карту вбок
    await page.mouse.move(70, 150);
    await page.mouse.down();
    await page.mouse.move(180, 150, { steps: 8 });
    await page.waitForTimeout(120);
    const during = await page.screenshot({ clip });
    await page.mouse.up();
    expect(Buffer.compare(before, during)).not.toBe(0);
  });

  test("инерция: пан-флик продолжает ехать после отпускания", async ({ page }) => {
    const thumb = () =>
      page.$eval(".fd-scrollbar-y .fd-scrollbar-thumb", (e) => parseFloat((e as HTMLElement).style.top) || 0).catch(() => 0);
    await page.mouse.move(470, 500); // пустое место правее секций
    await page.mouse.down();
    await page.mouse.move(470, 150, { steps: 3 }); // быстрый флик вверх
    await page.mouse.up();
    const t0 = await thumb();
    await page.waitForTimeout(180);
    const t1 = await thumb();
    expect(t1).toBeGreaterThan(t0); // после отпускания скролл продолжился по инерции
  });
});

// Действия через дропзоны (флип/сжечь) — высокий вьюпорт, чтобы зоны были на экране.
// Координаты берём из тест-хука движка (window.__fd.testHooks), а не пиксельным гаданием.
test.describe("песочница — действия", () => {
  test.use({ viewport: { width: 500, height: 1900 } }); // «Стопки» теперь после Карт/Кнопок/Дропзон/Фигур, ниже по странице
  const hooks = (page: import("@playwright/test").Page) =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __fd: {
              testHooks(): {
                zones: Record<string, { x: number; y: number }>;
                firstCard: { x: number; y: number; faceUp: boolean } | null;
                cardCount: number;
                grips: ({ x: number; y: number } | null)[];
                stackCards: { x: number; y: number }[][];
                stackIds: string[][];
                markerVis: { dragger: boolean; anchor: boolean }[];
                stackModeAt: { x: number; y: number }[];
                stackSqueezeAt: { x: number; y: number }[];
                stackReorderAt: { x: number; y: number } | null;
                cardW: number;
                draggingId: string | null;
              };
            };
          }
        ).__fd.testHooks(),
    );

  test.beforeEach(async ({ page }) => {
    await page.goto("/free-desk");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  });

  // Хук отдаёт координаты ОТНОСИТЕЛЬНО КАНВАСА (как global у Pixi); мышь Playwright бьёт по
  // странице — прибавляем оффсет канваса (топбар сверху сдвигает его вниз).
  const dragTo = async (page: import("@playwright/test").Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 12 });
    await page.mouse.up();
  };

  test("дроп на ПЕРЕВОРОТ переворачивает карту", async ({ page }) => {
    const h1 = await hooks(page);
    expect(h1.firstCard).not.toBeNull();
    await dragTo(page, h1.firstCard!, h1.zones["ПЕРЕВОРОТ"]!);
    await page.waitForTimeout(700);
    const h2 = await hooks(page);
    expect(h2.firstCard!.faceUp).toBe(!h1.firstCard!.faceUp);
  });

  test("дроп на СЖЕЧЬ уничтожает карту", async ({ page }) => {
    const h1 = await hooks(page);
    await dragTo(page, h1.firstCard!, h1.zones["СЖЕЧЬ"]!);
    await page.waitForTimeout(1000); // догореть + reap
    const h2 = await hooks(page);
    expect(h2.cardCount).toBe(h1.cardCount - 1);
  });

  test("дроп стопки на ПЕРЕВОРОТ переворачивает всю пачку", async ({ page }) => {
    const h = await hooks(page);
    const grip = h.grips.find((g) => g)!; // грип стопки (5 карт)
    const box = (await page.locator("canvas").boundingBox())!;
    const clip = { x: box.x + grip.x - 130, y: box.y + grip.y - 150, width: 260, height: 170 };
    const before = await page.screenshot({ clip });
    await dragTo(page, grip, h.zones["ПЕРЕВОРОТ"]!);
    await page.waitForTimeout(900);
    const after = await page.screenshot({ clip });
    expect(Buffer.compare(before, after)).not.toBe(0); // лица → рубашки, порядок реверснут
  });

  test("дроп стопки на СЖЕЧЬ сжигает всю пачку", async ({ page }) => {
    const h = await hooks(page);
    const grip = h.grips.find((g) => g)!;
    await dragTo(page, grip, h.zones["СЖЕЧЬ"]!);
    await page.waitForTimeout(1100);
    const h2 = await hooks(page);
    expect(h2.cardCount).toBe(h.cardCount - 5); // сгорела вся пачка из 5
  });

  test("грип стопки тянет всю пачку (сцена меняется)", async ({ page }) => {
    const h = await hooks(page);
    const grip = h.grips.find((g) => g)!; // первый непустой драггер (стопка 2)
    expect(grip).toBeTruthy();
    const box = (await page.locator("canvas").boundingBox())!;
    const clip = { x: box.x + grip.x - 120, y: box.y + grip.y - 180, width: 240, height: 200 };
    const before = await page.screenshot({ clip });
    await page.mouse.move(box.x + grip.x, box.y + grip.y);
    await page.mouse.down();
    await page.mouse.move(box.x + grip.x + 30, box.y + grip.y + 150, { steps: 12 });
    await page.waitForTimeout(150);
    const during = await page.screenshot({ clip });
    await page.mouse.up();
    expect(Buffer.compare(before, during)).not.toBe(0);
  });

  test("метки: драггер виден в покое; якоря — по своей политике (always/away/empty)", async ({ page }) => {
    const h = await hooks(page);
    // В покое драггер (грип) виден у всех трёх стопок — за него тянут пачку.
    expect(h.markerVis.map((m) => m.dragger)).toEqual([true, true, true]);
    // Якоря: стопка0 «когда унесли» (нет), стопка1 «когда пусто» (нет), стопка2 «всегда» (да).
    expect(h.markerVis.map((m) => m.anchor)).toEqual([false, false, true]);
  });

  test("сожжённая стопка: драггер гаснет, якорь «когда пусто» загорается (свап)", async ({ page }) => {
    const h = await hooks(page);
    const grip = h.grips[1]!; // стопка1 (якорь showEmpty), на экране
    await dragTo(page, grip, h.zones["СЖЕЧЬ"]!);
    await page.waitForTimeout(1100); // догореть + reap (byId удалит карты)
    const g = await hooks(page);
    expect(g.markerVis[1]!.dragger).toBe(false); // дома пусто — грип не за что цеплять
    expect(g.markerVis[1]!.anchor).toBe(true); // total=0 → якорь «когда пусто» показался
  });

  test("тап по верхней карте в стопке цепляет ЕЁ, не нижнюю (приоритет по z)", async ({ page }) => {
    const h = await hooks(page);
    const box = (await page.locator("canvas").boundingBox())!;
    const c8 = h.stackCards[0]![2]!; // карта i=2 = «8» стопки 1 (без ручки, режим «по карте»)
    // жмём в видимую полосу «8» слева от её центра (там 8 сверху 7, но старый код цеплял 7)
    await page.mouse.move(box.x + c8.x - 0.3 * h.cardW, box.y + c8.y);
    await page.mouse.down();
    const g = await hooks(page);
    await page.mouse.up();
    expect(g.draggingId).toBe("stk0c2"); // схвачена «8», а не «7» (stk0c1)
  });

  test("реордер стопки: тянешь верхнюю карту в начало → порядок меняется", async ({ page }) => {
    let h = await hooks(page);
    const before = h.stackIds[0]!;
    const top = h.stackCards[0]![before.length - 1]!; // верх = крайняя справа
    const first = h.stackCards[0]![0]!;
    // левее центра c0 (карты внахлёст 0.4w) — чтобы индекс дропа был именно 0. Режим «по карте» (умолч.).
    await dragTo(page, top, { x: first.x - h.cardW * 0.4, y: first.y });
    await page.waitForTimeout(500);
    h = await hooks(page);
    const after = h.stackIds[0]!;
    expect(after[0]).toBe(before[before.length - 1]); // верхняя встала в начало
    expect(after).not.toEqual(before);
  });

  test("раступание стопки: при наведении карты (кроме перетаскиваемой) раздвигаются", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    let h = await hooks(page);
    const ids = h.stackIds[0]!;
    const sc = h.stackCards[0]!;
    const restById = new Map(ids.map((id, i) => [id, sc[i]!]));
    const dragged = ids[ids.length - 1]!; // верхняя (крайняя справа)
    const top = sc[sc.length - 1]!;
    const first = sc[0]!;
    // хватаем верхнюю и ЗАВИСАЕМ над началом стопки (не отпуская)
    await page.mouse.move(box.x + top.x, box.y + top.y);
    await page.mouse.down();
    await page.mouse.move(box.x + first.x + 20, box.y + first.y, { steps: 14 });
    await page.waitForTimeout(450);
    h = await hooks(page);
    const spread = h.stackIds[0]!.some((id, i) => {
      if (id === dragged) return false; // перетаскиваемая у пальца — её не считаем
      const r = restById.get(id)!;
      return Math.abs(h.stackCards[0]![i]!.x - r.x) > 15 || Math.abs(h.stackCards[0]![i]!.y - r.y) > 15;
    });
    await page.mouse.up();
    expect(spread).toBe(true); // соседи раздвинулись под дыру
  });

  test("тумблер «всю стопку»: тап по любой карте цепляет ВСЮ пачку, не только грип", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    let h = await hooks(page);
    await page.mouse.click(box.x + h.stackModeAt[1]!.x, box.y + h.stackModeAt[1]!.y); // «всю стопку»
    await page.waitForTimeout(150);
    h = await hooks(page);
    const sIdx = 2; // третья стопка (якорь «всегда») — свободна от других тестов этого файла
    const before = h.stackCards[sIdx]!;
    const bottom = before[0]!; // нижняя карта — НЕ грип, тапаем карту напрямую
    const dx = -40;
    await page.mouse.move(box.x + bottom.x, box.y + bottom.y);
    await page.mouse.down();
    await page.mouse.move(box.x + bottom.x + dx, box.y + bottom.y + 20, { steps: 12 });
    await page.waitForTimeout(200);
    const g = await hooks(page);
    await page.mouse.up();
    const other = g.stackCards[sIdx]![1]!; // соседняя карта — за неё НЕ тянули
    const otherBefore = before[1]!;
    // В режиме «всю стопку» тап по ЛЮБОЙ карте цепляет драггер стопки — вся пачка едет синхронно.
    expect(Math.sign(other.x - otherBefore.x)).toBe(Math.sign(dx));
    expect(Math.abs(other.x - otherBefore.x)).toBeGreaterThan(10);
  });

  test("тумблер «в руку»: пачка сжимается тесно при драге (не врассыпную)", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    let h = await hooks(page);
    await page.mouse.click(box.x + h.stackSqueezeAt[1]!.x, box.y + h.stackSqueezeAt[1]!.y); // «в руку»
    await page.waitForTimeout(150);
    h = await hooks(page);
    const grip = h.grips[0]!;
    await page.mouse.move(box.x + grip.x, box.y + grip.y);
    await page.mouse.down();
    await page.mouse.move(box.x + grip.x + 40, box.y + grip.y - 140, { steps: 12 });
    await page.waitForTimeout(200);
    const g = await hooks(page);
    await page.mouse.up();
    const cards = g.stackCards[0]!;
    const spreadX = Math.max(...cards.map((c) => c.x)) - Math.min(...cards.map((c) => c.x));
    expect(spreadX).toBeLessThan(h.cardW * 0.5); // тесная пачка под пальцем, не раскрытый веер
  });

  test("тумблер «реордер стопок: выкл» — тянешь верхнюю карту, порядок НЕ меняется", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    let h = await hooks(page);
    expect(h.stackReorderAt).not.toBeNull();
    await page.mouse.click(box.x + h.stackReorderAt!.x, box.y + h.stackReorderAt!.y); // вкл → выкл
    await page.waitForTimeout(150);
    h = await hooks(page);
    const before = h.stackIds[0]!;
    const top = h.stackCards[0]![before.length - 1]!;
    const first = h.stackCards[0]![0]!;
    await dragTo(page, top, { x: first.x - h.cardW * 0.4, y: first.y });
    await page.waitForTimeout(500);
    const g = await hooks(page);
    expect(g.stackIds[0]!).toEqual(before); // реордер выключен — порядок как был
  });

  test("якорь «когда унесли»: скрыт дома, показывается пока стопку держат вдали", async ({ page }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    const h = await hooks(page);
    expect(h.markerVis[0]!.anchor).toBe(false); // дома
    const grip = h.grips[0]!;
    await page.mouse.move(box.x + grip.x, box.y + grip.y);
    await page.mouse.down();
    await page.mouse.move(box.x + grip.x + 150, box.y + grip.y + 150, { steps: 12 });
    await page.waitForTimeout(200);
    const g = await hooks(page);
    expect(g.markerVis[0]!.anchor).toBe(true); // унесли — якорь появился
    await page.mouse.up();
  });
});

// Топбар (HTML): рестарты и возврат в меню.
test.describe("песочница — топбар", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/free-desk");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  });

  test("рестарт песочницы — сцена остаётся", async ({ page }) => {
    await page.locator(".fd-btn", { hasText: "рестарт песочницы" }).click();
    await page.waitForTimeout(400);
    expect((await page.screenshot()).length).toBeGreaterThan(20000);
  });

  test("рестарт канваса — сцена остаётся", async ({ page }) => {
    await page.locator(".fd-btn", { hasText: "рестарт канваса" }).click();
    await page.waitForTimeout(700);
    expect((await page.screenshot()).length).toBeGreaterThan(20000);
  });

  test("← в меню уводит на главный экран", async ({ page }) => {
    await page.locator(".fd-btn", { hasText: "в меню" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await expect(page.locator("canvas")).toBeVisible();
  });
});

// «Карты — варианты»: ряд из 12 карточек-примеров (STORIES в freeDeskEngine.ts). Раньше был
// покрыт только индекс 0 («открытая», через firstCard в других тестах) — остальные 11 рендерились,
// но ни одна их особенность не проверялась. storyCards в тест-хуке отдаёт живые пропы каждой карты
// по тому же индексу, что и STORIES (ряд спавнится первым — см. комментарий у хука).
test.describe("песочница — Карты: варианты", () => {
  const hooks = (page: import("@playwright/test").Page) =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __fd: {
              testHooks(): {
                storyCards: { caption: string; x: number; y: number; card: string; faceUp: boolean; draggable: boolean; back: string; faceStyle: string; fourColor: boolean; torn: boolean; size: number; custom: string; rest: string }[];
              };
            };
          }
        ).__fd.testHooks(),
    );

  test.beforeEach(async ({ page }) => {
    await page.goto("/free-desk");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  });

  test("все 12 карточек ряда несут свой проп — открытая/закрытая/рубашка/лицо/4-цветная/порванная/×0.7/держат/приподнята/джокер", async ({ page }) => {
    const h = await hooks(page);
    expect(h.storyCards).toHaveLength(12);
    const byCaption = new Map(h.storyCards.map((c) => [c.caption, c]));
    expect(byCaption.get("открытая")!.faceUp).toBe(true);
    expect(byCaption.get("закрытая")!.faceUp).toBe(false);
    expect(byCaption.get("рубашка: изумруд")!.back).toBe("emerald");
    expect(byCaption.get("лицо: символ")!.faceStyle).toBe("symbol");
    expect(byCaption.get("4-цветная")!.fourColor).toBe(true);
    expect(byCaption.get("порванная")!.torn).toBe(true);
    expect(byCaption.get("меньше ×0.7")!.size).toBe(0.7);
    expect(byCaption.get("нельзя тащить")!.draggable).toBe(false);
    expect(byCaption.get("удерживаемая")!.rest).toBe("held");
    expect(byCaption.get("приподнятая (в руке)")!.rest).toBe("floating");
    expect(byCaption.get("джокер")!.custom).toBe("joker");
  });

  test("«нельзя тащить»: реальный драг не двигает карту", async ({ page }) => {
    const h = await hooks(page);
    const card = h.storyCards.find((c) => c.caption === "нельзя тащить")!;
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + card.x, box.y + card.y);
    await page.mouse.down();
    await page.mouse.move(box.x + card.x + 120, box.y + card.y + 60, { steps: 10 });
    await page.waitForTimeout(150);
    const during = (await hooks(page)).storyCards.find((c) => c.caption === "нельзя тащить")!;
    await page.mouse.up();
    // допуск на «стоп»-покачивание (block-анимация при попытке драга недрагабл-карты), не на реальный сдвиг
    expect(Math.hypot(during.x - card.x, during.y - card.y)).toBeLessThan(6);
  });

  test("«джокер»: custom-лицо визуально отличается от обычной пронумерованной карты", async ({ page }) => {
    const h = await hooks(page);
    const joker = h.storyCards.find((c) => c.caption === "джокер")!;
    const plain = h.storyCards.find((c) => c.caption === "открытая")!; // A♠, обычное числовое лицо
    const clipAt = (c: { x: number; y: number }) => ({ x: c.x - 60, y: c.y - 85, width: 120, height: 170 });
    const jokerShot = await page.screenshot({ clip: clipAt(joker) });
    const plainShot = await page.screenshot({ clip: clipAt(plain) });
    expect(Buffer.compare(jokerShot, plainShot)).not.toBe(0);
  });
});
