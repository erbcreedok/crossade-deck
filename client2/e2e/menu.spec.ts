import { test, expect } from "@playwright/test";

// Меню на канвасе: движок отрисовал кнопки, а «сосать» проигрывает анимацию крика.
test.describe("меню", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
  });

  test("канвас отрисован (графика не пустая)", async ({ page }) => {
    await expect(page.locator("canvas")).toBeVisible();
    // Полный кадр с двумя кнопками весит заметно больше пустого фона (порог грубый, зависит от
    // «чернил» шрифта — Handjet тоньше прежнего VT323; пустой канвас сжимается в ~2КБ).
    const shot = await page.screenshot();
    expect(shot.length).toBeGreaterThan(4000);
  });

  test("«сосать» запускает анимацию крика (кадр меняется)", async ({ page }) => {
    // Кнопку ищем ЧЕРЕЗ ДВИЖОК, а не по зашитым координатам: меню целиком на канвасе, DOM-узлов
    // у кнопок нет, и прежний хардкод (250, 364) промахнулся мимо «сосать», как только в меню
    // добавили третью кнопку («косынка», issue #99) и раскладка съехала.
    const btn = await page.evaluate(() => {
      const m = (window as unknown as { __menu: { testHooks(): { buttons: { label: string; x: number; y: number }[] } } }).__menu;
      return m.testHooks().buttons.find((b) => b.label === "сосать")!;
    });
    const box = (await page.locator("canvas").boundingBox())!;
    const clip = { x: box.x + btn.x - 150, y: box.y + btn.y - 40, width: 300, height: 160 }; // центр, где вылетает лейбл
    const before = await page.screenshot({ clip });
    await page.mouse.click(box.x + btn.x, box.y + btn.y);
    await page.waitForTimeout(140); // середина анимации появления
    const during = await page.screenshot({ clip });
    expect(Buffer.compare(before, during)).not.toBe(0); // что-то анимируется в центре
  });

  test("неприметный тумблер на старый клиент (v1) присутствует", async ({ page }) => {
    const href = await page.locator(".ver-switch").getAttribute("href");
    expect(href).toContain("5173"); // локально ведёт на порт соседнего клиента
  });

  test("бренд-бейдж не рендерится вне PWA-айфона-с-вырезом", async ({ page }) => {
    // Гейт в JS (standalone + iPhone + верхний вырез) — в десктоп-браузере пилюли нет вовсе.
    await expect(page.locator(".brand-badge")).toHaveCount(0);
  });

  test("номер сборки виден в углу (vX.Y.Z+build)", async ({ page }) => {
    const badge = page.locator(".ver-build");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/^v\d+\.\d+\.\d+\+.+$/);
  });
});
