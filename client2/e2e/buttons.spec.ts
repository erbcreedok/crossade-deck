import { test, expect, type Page } from "@playwright/test";

// Секция «Кнопки»: витрина вариантов/размеров/состояния «недоступна». Демо-кнопки без onClick
// (чисто витрина стилей) — проверяем то, что реально наблюдаемо: все 8 отрисованы с верной
// подписью/disabled-флагом, клик по обычной кнопке не роняет страницу, disabled остаётся disabled.
test.describe("песочница — секция «Кнопки»", () => {
  test.use({ viewport: { width: 900, height: 5800 } }); // высокий — секция видна без панорамирования

  interface Hooks {
    buttonShowcase: { cap: string; x: number; y: number; disabled: boolean }[];
  }
  const hooks = (page: Page): Promise<Hooks> =>
    page.evaluate(() => (window as unknown as { __fd: { testHooks(): Hooks } }).__fd.testHooks());

  test.beforeEach(async ({ page }) => {
    await page.goto("/playground");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
  });

  test("все 8 демо-кнопок отрисованы: 4 варианта + 3 размера + disabled", async ({ page }) => {
    const h = await hooks(page);
    const caps = h.buttonShowcase.map((b) => b.cap);
    expect(caps).toEqual(["primary", "secondary", "danger", "ghost", "sm", "md", "lg", "disabled"]);
    expect(h.buttonShowcase.filter((b) => b.disabled).map((b) => b.cap)).toEqual(["disabled"]);
  });

  test("клик по каждому варианту/размеру не роняет страницу (variant/size — чистая витрина)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const h = await hooks(page);
    const box = (await page.locator("canvas").boundingBox())!;
    for (const b of h.buttonShowcase.filter((x) => !x.disabled)) {
      await page.mouse.click(box.x + b.x, box.y + b.y);
    }
    await page.waitForTimeout(150);
    expect(errors).toEqual([]);
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("disabled-кнопка остаётся disabled после клика", async ({ page }) => {
    const h = await hooks(page);
    const box = (await page.locator("canvas").boundingBox())!;
    const dis = h.buttonShowcase.find((b) => b.cap === "disabled")!;
    await page.mouse.click(box.x + dis.x, box.y + dis.y);
    await page.waitForTimeout(150);
    const g = await hooks(page);
    expect(g.buttonShowcase.find((b) => b.cap === "disabled")!.disabled).toBe(true);
  });
});
