import { test, expect, type Page } from "@playwright/test";

// Регионная площадка (Mechanics/Hud Regions): углы по владельцам — наплывов нет по ФОРМУЛЕ.
// Сторожа держат сами рычаги панели: corners двигает руку, bleed возвращает полный лейн,
// slot прижимает выбором региона. Дев-хук `__story` — идиома канваса.

interface StoryLike {
  hud: {
    screenPoses(): { zone: string; id: string; x: number; y: number }[];
    reserved(w: number, h: number): { top: number; bottom: number; left: number; right: number };
  };
}

declare global {
  interface Window {
    __story?: StoryLike;
  }
}

const open = async (page: Page, args = ""): Promise<void> => {
  await page.goto(`/iframe.html?id=mechanics-hud-regions--regions-playground&viewMode=story${args ? `&args=${args}` : ""}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
};

const handMinX = (page: Page): Promise<number> =>
  page.evaluate(() => Math.min(...window.__story!.hud.screenPoses().filter((p) => p.zone === "hand").map((p) => p.x)));

test.describe("HUD: регионы и углы", () => {
  test("резерв: занятые края двигают стол, углы горизонталей по дефолту", async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => window.__story!.hud.reserved(window.innerWidth, window.innerHeight));
    expect(r.bottom).toBeGreaterThan(0);
    expect(r.top).toBeGreaterThan(0);
    expect(r.left).toBeGreaterThan(0); // туллбар
    expect(r.right).toBeGreaterThan(0); // чат
  });

  test("corners: отдать нижне-левый угол колонке — рука уступает; bleed возвращает полный лейн", async ({ page }) => {
    await open(page);
    const base = await handMinX(page);
    await open(page, "cornerBottomLeft:left");
    const ceded = await handMinX(page);
    expect(ceded - base).toBeGreaterThan(40); // лейн низа срезан на вторжение левой колонки
    await open(page, "cornerBottomLeft:left;handBleed:!true");
    const bled = await handMinX(page);
    expect(Math.abs(bled - base)).toBeLessThan(2); // явный наплыв — полный лейн, как без спора
  });

  test("прижим — выбором региона: handSlot end уводит руку к правому краю (перед «реакциями»)", async ({ page }) => {
    await open(page);
    const start = await handMinX(page);
    await open(page, "handSlot:end");
    const end = await handMinX(page);
    const vw = page.viewportSize()!.width;
    // Вьюпорт узкий (500): end-блок «рука+реакции» почти заполняет лейн — сдвиг мал, но обязан быть.
    expect(end).toBeGreaterThan(start + 30);
    // «Реакции» — end-блок вместе с рукой: рука не вылезает за правую safe-границу.
    const maxX = await page.evaluate(() => Math.max(...window.__story!.hud.screenPoses().filter((p) => p.zone === "hand").map((p) => p.x)));
    expect(maxX).toBeLessThan(vw);
  });
});
