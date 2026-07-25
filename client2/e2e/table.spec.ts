import { test, expect } from "@playwright/test";

// Стол (прототип Пути 2): движок поднимается со шрифтами (canvasHost) и рисует сцену; драг
// карт идёт через общий InputRouter (E7). Логика пула/сборки — под юнитами; тут смок + драг.
test.describe("стол", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/table");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  });

  test("канвас отрисован — сцена не пустая", async ({ page }) => {
    await expect(page.locator("canvas")).toBeVisible();
    const shot = await page.screenshot();
    expect(shot.length).toBeGreaterThan(10000);
  });

  test("драг карты из колоды меняет сцену (InputRouter)", async ({ page }) => {
    const before = await page.screenshot();
    await page.mouse.move(75, 95); // центр зоны колоды (левый верх)
    await page.mouse.down();
    await page.mouse.move(250, 700, { steps: 12 }); // в руку (низ)
    await page.mouse.up();
    await page.waitForTimeout(700); // перелёт+rebuild
    const after = await page.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });
});
