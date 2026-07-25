import { test, expect } from "@playwright/test";

// Стол (прототип Пути 2): проверяем, что движок поднимается со шрифтами (canvasHost) и рисует
// сцену. Интеракции стола (драг между зонами) — под юнитами TablePool, тут только смок рендера.
test("стол: канвас отрисован — сцена не пустая", async ({ page }) => {
  await page.goto("/table");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await expect(page.locator("canvas")).toBeVisible();
  const shot = await page.screenshot();
  expect(shot.length).toBeGreaterThan(10000);
});
