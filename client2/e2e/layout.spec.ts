import { test, expect, devices, type Page } from "@playwright/test";

// ВЁРСТКА ПО УСТРОЙСТВАМ: гоняем ключевые экраны по матрице вьюпортов/UA (десктоп, мелкое окно,
// айфоны с островом/чёлкой/без, андроиды, планшеты) и проверяем инварианты, не зависящие от
// «пикселя-в-пиксель»: канвас занимает всю ширину, HTML-хром (версия, кнопки топбара) НЕ обрезан
// краем экрана, нет горизонтального переполнения страницы.
//
// Чего эти тесты НЕ ловят (физически): safe-area, Dynamic Island и display-mode: standalone —
// Playwright их не эмулирует. Поэтому бренд-пилюля тут только проверяется как ОТСУТСТВУЮЩАЯ в
// обычном браузере (её позиция за островом — device-only, глазами).

// Пресет устройства БЕЗ defaultBrowserType — его нельзя в test.use внутри describe (форсит воркер).
// Остальное (viewport, userAgent, deviceScaleFactor, isMobile, hasTouch) — то, что задаёт вёрстку.
function dev(name: string) {
  const { defaultBrowserType: _drop, ...rest } = devices[name]!;
  return rest;
}

const MATRIX: { name: string; use: Parameters<typeof test.use>[0] }[] = [
  { name: "десктоп 1440", use: { viewport: { width: 1440, height: 900 } } },
  { name: "десктоп мелкий 900", use: { viewport: { width: 900, height: 600 } } },
  { name: "узкое окно 360", use: { viewport: { width: 360, height: 720 } } },
  { name: "iPhone SE (без выреза)", use: dev("iPhone SE") },
  { name: "iPhone 13 (чёлка)", use: dev("iPhone 13") },
  { name: "iPhone 14 Pro (остров)", use: dev("iPhone 14 Pro") },
  { name: "Pixel 7 (Android)", use: dev("Pixel 7") },
  { name: "Galaxy S8 (узкий Android)", use: dev("Galaxy S8") },
  { name: "iPad Mini (планшет)", use: dev("iPad Mini") },
  { name: "iPad Pro 11 (планшет)", use: dev("iPad Pro 11") },
];

const settle = async (page: Page) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
};
const vw = (page: Page) => page.viewportSize()!.width;
const vh = (page: Page) => page.viewportSize()!.height;
// Горизонтальное переполнение страницы (>1px — вылезает контент вбок).
const horizOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// Элемент целиком в пределах экрана по горизонтали (не обрезан краем).
async function expectInsideWidth(page: Page, selector: string) {
  const box = (await page.locator(selector).boundingBox())!;
  expect(box, `${selector} есть на экране`).toBeTruthy();
  expect(box.x, `${selector} не срезан слева`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${selector} не срезан справа`).toBeLessThanOrEqual(vw(page) + 1);
}

for (const d of MATRIX) {
  test.describe(d.name, () => {
    test.use(d.use);

    test("меню: канвас во всю ширину, версия видна и в экране, без переполнения", async ({ page }) => {
      await page.goto("/");
      await settle(page);

      const canvas = page.locator(".table-host canvas");
      await expect(canvas).toBeVisible();
      const cb = (await canvas.boundingBox())!;
      expect(cb.width, "канвас занимает всю ширину").toBeGreaterThanOrEqual(vw(page) - 2);

      // Номер сборки виден и не вылезает за края.
      const vb = page.locator(".ver-build");
      await expect(vb).toBeVisible();
      const b = (await vb.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(vw(page) + 1);
      expect(b.y + b.height).toBeLessThanOrEqual(vh(page) + 1);

      // Бренд-пилюля в обычном браузере не должна рендериться (гейт standalone+iPhone+вырез).
      await expect(page.locator(".brand-badge")).toHaveCount(0);

      expect(await horizOverflow(page), "нет горизонтального переполнения").toBeLessThanOrEqual(1);
    });

    test("песочница: канвас во всю ширину, кнопки топбара не обрезаны, без переполнения", async ({ page }) => {
      await page.goto("/free-desk");
      await settle(page);

      const canvas = page.locator(".table-host canvas");
      await expect(canvas).toBeVisible();
      const cb = (await canvas.boundingBox())!;
      expect(cb.width, "канвас занимает всю ширину").toBeGreaterThanOrEqual(vw(page) - 2);

      // Все кнопки топбара помещаются по ширине (ни одна не уезжает за край).
      const btns = page.locator(".fd-topbar .fd-btn");
      const n = await btns.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const box = (await btns.nth(i).boundingBox())!;
        expect(box.x, `кнопка ${i} не срезана слева`).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width, `кнопка ${i} не срезана справа`).toBeLessThanOrEqual(vw(page) + 1);
      }

      expect(await horizOverflow(page), "нет горизонтального переполнения").toBeLessThanOrEqual(1);
    });
  });
}
