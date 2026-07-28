import { test, expect } from "@playwright/test";

// Дропзона «ПОДГЛЯДЕТЬ» (issue #47): временно снимает скрытность («пыль») с карты, чтобы её
// рассмотреть, потом сама возвращает скрытность и карту домой. Повторный драг во время показа
// (abort) — скрытность НЕ восстанавливается, карта не возвращается домой (см. freeDeskEngine.ts
// startPeek/releaseElement). Источник карты — «скрытая (пыль)» из ряда «Карты — варианты»
// (STORIES[2]), тот же приём, что уже используют тесты ПЕРЕВОРОТ/СЖЕЧЬ в sandbox.spec.ts.
//
// Три состояния подписи зоны (rest/armed/hot — см. DropZone.ts): в покое — «ПОДГЛЯДЕТЬ»; пока
// где-то на канвасе тянут СПОСОБНУЮ карту, но ещё не над зоной — «давай подсмотрим?» (armed,
// только у этой зоны); карту навели именно на зону — «Отпускай!» (hot).
test.describe("песочница — дропзона ПОДГЛЯДЕТЬ", () => {
  // Ширина 1000, не 500: с #40 «Дропзоны» переехали ВПРАВО от «Карты — варианты» (та же строка,
  // не следующая) — на узком вьюпорте зона уходит за правый край и требует пана, недоступного
  // для page.mouse (координаты вне окна). 1000×1900 держит и ПОДГЛЯДЕТЬ, и фишку из «Фигур» (для
  // регрессии «чужая фигура») в кадре без пана.
  test.use({ viewport: { width: 1000, height: 1900 } });

  const hooks = (page: import("@playwright/test").Page) =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __fd: {
              testHooks(): {
                zones: Record<string, { x: number; y: number }>;
                zoneHot: Record<string, boolean>;
                zoneArmed: Record<string, boolean>;
                zoneHotText: Record<string, string>;
                zoneArmedText: Record<string, string>;
                storyCards: { caption: string; x: number; y: number; faceUp: boolean; concealed: boolean }[];
                pieces: { id: string; x: number; y: number }[];
              };
            };
          }
        ).__fd.testHooks(),
    );

  const dragTo = async (page: import("@playwright/test").Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 12 });
    await page.mouse.up();
  };

  test.beforeEach(async ({ page }) => {
    await page.goto("/free-desk");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  });

  test("дроп на ПОДГЛЯДЕТЬ раскрывает карту, а спустя 3 сек сама прячет и возвращает домой", async ({ page }) => {
    const h1 = await hooks(page);
    const home = h1.storyCards.find((c) => c.caption === "скрытая (пыль)")!;
    expect(home).toBeTruthy();

    await dragTo(page, home, h1.zones["ПОДГЛЯДЕТЬ"]!);
    await page.waitForTimeout(700); // осесть на дроп-позиции
    const revealed = (await hooks(page)).storyCards.find((c) => c.caption === "скрытая (пыль)")!;
    expect(revealed.concealed).toBe(false);
    expect(revealed.faceUp).toBe(true);

    await page.waitForTimeout(3200); // пересечь PEEK_DUR=3с от дропа
    const restored = (await hooks(page)).storyCards.find((c) => c.caption === "скрытая (пыль)")!;
    expect(restored.concealed).toBe(true); // пыль вернулась

    await page.waitForTimeout(600); // дать пружине доехать домой
    const back = (await hooks(page)).storyCards.find((c) => c.caption === "скрытая (пыль)")!;
    expect(Math.hypot(back.x - home.x, back.y - home.y)).toBeLessThan(20);
  });

  test("abort: повторный драг во время показа — скрытность НЕ восстанавливается, но карта возвращается домой", async ({ page }) => {
    const h1 = await hooks(page);
    const home = h1.storyCards.find((c) => c.caption === "скрытая (пыль)")!;

    await dragTo(page, home, h1.zones["ПОДГЛЯДЕТЬ"]!);
    await page.waitForTimeout(400); // заведомо меньше PEEK_DUR=3с

    const midway = (await hooks(page)).storyCards.find((c) => c.caption === "скрытая (пыль)")!;
    expect(midway.concealed).toBe(false); // ещё «подсмотрели»

    // Реальный повторный драг — забираем карту с её текущей (замёрзшей) позиции.
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + midway.x, box.y + midway.y);
    await page.mouse.down();
    await page.mouse.move(box.x + midway.x + 150, box.y + midway.y + 80, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(4000); // далеко за PEEK_DUR — восстановления быть не должно
    const after = (await hooks(page)).storyCards.find((c) => c.caption === "скрытая (пыль)")!;
    expect(after.concealed).toBe(false); // флаг потерян навсегда, не восстановился
    // А вот МЕСТО abort не отнимает: карта возвращается домой обычной пружиной. Раньше она уезжала
    // под весь контент («свободное падение» из тикета буквально) и терялась насовсем — см. #47.
    expect(Math.hypot(after.x - home.x, after.y - home.y)).toBeLessThan(20);
  });

  test("чужая фигура (фишка) не активирует ПОДГЛЯДЕТЬ — зона не подсвечивается, драг не считается поглядом", async ({ page }) => {
    const h1 = await hooks(page);
    const chip = h1.pieces.find((p) => p.id === "chip-5")!;
    const zone = h1.zones["ПОДГЛЯДЕТЬ"]!;
    const box = (await page.locator("canvas").boundingBox())!;

    await page.mouse.move(box.x + chip.x, box.y + chip.y);
    await page.mouse.down();
    await page.waitForTimeout(80); // armed-цикл (frame()) успевает отработать на неспособном грузе
    expect((await hooks(page)).zoneArmed["ПОДГЛЯДЕТЬ"]).toBe(false); // фишка не Concealable — armed не загорается
    await page.mouse.move(box.x + zone.x, box.y + zone.y, { steps: 12 });
    await page.waitForTimeout(150);
    expect((await hooks(page)).zoneHot["ПОДГЛЯДЕТЬ"]).toBe(false); // не Concealable — зона не «врёт» глаголом
    await page.mouse.up();
  });

  test("три состояния подписи: rest → armed («давай подсмотрим?») при драге карты, → hot («Отпускай!») над зоной", async ({ page }) => {
    const h1 = await hooks(page);
    expect(h1.zoneArmed["ПОДГЛЯДЕТЬ"]).toBe(false);
    expect(h1.zoneHot["ПОДГЛЯДЕТЬ"]).toBe(false); // rest

    const home = h1.storyCards.find((c) => c.caption === "скрытая (пыль)")!;
    const zone = h1.zones["ПОДГЛЯДЕТЬ"]!;
    const box = (await page.locator("canvas").boundingBox())!;

    await page.mouse.move(box.x + home.x, box.y + home.y);
    await page.mouse.down();
    await page.waitForTimeout(80);
    const armedState = await hooks(page);
    expect(armedState.zoneArmed["ПОДГЛЯДЕТЬ"]).toBe(true); // драг способной карты начался — armed
    expect(armedState.zoneHot["ПОДГЛЯДЕТЬ"]).toBe(false); // но ещё не над зоной
    expect(armedState.zoneArmedText["ПОДГЛЯДЕТЬ"]).toBe("давай подсмотрим?"); // карта скрыта — есть что

    await page.mouse.move(box.x + zone.x, box.y + zone.y, { steps: 12 });
    await page.waitForTimeout(150);
    const hotState = await hooks(page);
    expect(hotState.zoneHot["ПОДГЛЯДЕТЬ"]).toBe(true); // навели — hot
    expect(hotState.zoneArmed["ПОДГЛЯДЕТЬ"]).toBe(false); // hot вытесняет armed (см. DropZone.updateVisibility)
    expect(hotState.zoneHotText["ПОДГЛЯДЕТЬ"]).toBe("Отпускай!");

    await page.mouse.up();
    await page.waitForTimeout(150);
    const restState = await hooks(page);
    expect(restState.zoneHot["ПОДГЛЯДЕТЬ"]).toBe(false);
    expect(restState.zoneArmed["ПОДГЛЯДЕТЬ"]).toBe(false); // драг кончился — обратно в покой
  });

  test("карта уже видна (не скрыта, лицом вверх) — зона отвечает «зачем?»/«нет.» и после дропа карта летит домой без изменений", async ({ page }) => {
    const h1 = await hooks(page);
    const home = h1.storyCards.find((c) => c.caption === "открытая")!; // faceUp:true, concealed:false по умолчанию
    expect(home.faceUp).toBe(true);
    expect(home.concealed).toBe(false);
    const zone = h1.zones["ПОДГЛЯДЕТЬ"]!;
    const box = (await page.locator("canvas").boundingBox())!;

    await page.mouse.move(box.x + home.x, box.y + home.y);
    await page.mouse.down();
    await page.waitForTimeout(80);
    const armedState = await hooks(page);
    expect(armedState.zoneArmed["ПОДГЛЯДЕТЬ"]).toBe(true); // зона всё ещё реагирует (карта Concealable)
    expect(armedState.zoneArmedText["ПОДГЛЯДЕТЬ"]).toBe("зачем?"); // но нечего подглядывать

    await page.mouse.move(box.x + zone.x, box.y + zone.y, { steps: 12 });
    await page.waitForTimeout(150);
    const hotState = await hooks(page);
    expect(hotState.zoneHotText["ПОДГЛЯДЕТЬ"]).toBe("нет.");

    await page.mouse.up();
    await page.waitForTimeout(700); // пружина едет домой — startPeek вернул false, дроп не consumed
    const after = (await hooks(page)).storyCards.find((c) => c.caption === "открытая")!;
    expect(after.concealed).toBe(false); // без изменений
    expect(after.faceUp).toBe(true); // без изменений
    expect(Math.hypot(after.x - home.x, after.y - home.y)).toBeLessThan(20); // вернулась на своё место
  });
});
