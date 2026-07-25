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
    // Полный кадр с двумя кнопками весит заметно больше пустого фона.
    const shot = await page.screenshot();
    expect(shot.length).toBeGreaterThan(8000);
  });

  test("«сосать» запускает анимацию крика (кадр меняется)", async ({ page }) => {
    const clip = { x: 100, y: 320, width: 300, height: 160 }; // центр, где вылетает лейбл
    const before = await page.screenshot({ clip });
    await page.mouse.click(250, 364); // верхняя кнопка «сосать»
    await page.waitForTimeout(140); // середина анимации появления
    const during = await page.screenshot({ clip });
    expect(Buffer.compare(before, during)).not.toBe(0); // что-то анимируется в центре
  });

  test("неприметный тумблер на старый клиент (v1) присутствует", async ({ page }) => {
    const href = await page.locator(".ver-switch").getAttribute("href");
    expect(href).toContain("5173"); // локально ведёт на порт соседнего клиента
  });

  test("бренд-бейдж есть в DOM, но скрыт вне PWA (standalone)", async ({ page }) => {
    await expect(page.locator(".brand-badge")).toHaveText(/crusade/);
    await expect(page.locator(".brand-badge")).toBeHidden();
  });
});
