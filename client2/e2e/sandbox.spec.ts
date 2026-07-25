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
  test.use({ viewport: { width: 500, height: 1200 } });
  const hooks = (page: import("@playwright/test").Page) =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __fd: { testHooks(): { zones: Record<string, { x: number; y: number }>; firstCard: { x: number; y: number; faceUp: boolean } | null; cardCount: number; grips: ({ x: number; y: number } | null)[] } };
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
