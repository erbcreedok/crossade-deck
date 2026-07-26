import { test, expect, type Page } from "@playwright/test";

// ВИЗУАЛЬНАЯ РЕГРЕССИЯ (пиксельное сравнение с эталоном). Стало осмысленным после перехода на Handjet:
// кириллица рисуется ОДИНАКОВО в headless и на девайсе (раньше фолбэк расходился → эталоны врали).
// Покрываем то, что юнит/позиционные тесты не ловят — сам ВИД paint'а (узел-стрелка, декор, лицо карты).
//
// Правила стабильности: клип ТОЛЬКО по статике (без «дышащих» стопок песочницы); ждём шрифт + осадку
// сцены; допуск maxDiffPixelRatio — под мелкие различия сглаживания/GPU. Эталоны — per-платформа в
// visual.spec.ts-snapshots/, коммитятся. Меняешь paint осознанно → обнови: `npx playwright test
// visual.spec.ts --update-snapshots`.

test.use({ viewport: { width: 900, height: 5800 } }); // высокий вьюпорт: вся сцена в одном кадре, Поле видно

const settle = async (page: Page) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900); // Handjet + осадка пружин
};

test("Поле: узел-стрелка + декор (пустой грид, покой)", async ({ page }) => {
  await page.goto("/free-desk");
  await settle(page);
  const y = await page.evaluate(() => (window as unknown as { __fd: { testHooks(): { field: { gridRect: { y: number } } } } }).__fd.testHooks().field.gridRect.y);
  const box = (await page.locator("canvas").boundingBox())!;
  await expect(page).toHaveScreenshot("field-knot.png", {
    // Рендер детерминированный (Handjet стабилен) → допуск маленький: ловит сдвиг даже тонкой линии,
    // но прощает единичные пиксели сглаживания. threshold — порог различия ЦВЕТА пикселя (анти-алиас).
    clip: { x: box.x, y: Math.max(0, y - 80), width: 500, height: 240 },
    maxDiffPixels: 60,
    threshold: 0.15,
  });
});

test("Карты — SVG-масти на лицах (варианты)", async ({ page }) => {
  await page.goto("/free-desk");
  await settle(page);
  const box = (await page.locator("canvas").boundingBox())!;
  // Ряд «Карты — варианты»: туз (пики) + бубны — масти рисуются SVG. Статичная область.
  await expect(page).toHaveScreenshot("cards-suits.png", {
    clip: { x: box.x, y: 90, width: 640, height: 250 },
    maxDiffPixels: 80,
    threshold: 0.15,
  });
});

test("Скрытая карта — SVG-🖕 на жёлтом фоне", async ({ page }) => {
  await page.goto("/free-desk");
  await settle(page);
  const box = (await page.locator("canvas").boundingBox())!;
  // Третья карта ряда «варианты» = «скрытая» (лицом): средний палец (SVG-силуэт) на жёлтом фоне.
  await expect(page).toHaveScreenshot("hidden-face.png", {
    clip: { x: box.x + 448, y: 120, width: 130, height: 180 },
    maxDiffPixels: 80,
    threshold: 0.15,
  });
});
