import { test, expect, type Page } from "@playwright/test";

// ЖИВОЙ ДВИЖОК ВИТРИНЫ. Всё, что ниже, требует настоящей сцены: `Application`, тикер, пружины,
// хит-тест. В node этого нет, а подставлять весь Pixi ради четырёх правил значит проверять
// подделку — поэтому они живут здесь, в браузере, и смотрят ровно на то, что видит человек.
//
// Дев-хук `__kit.scene` — та же идиома, что `__fd` у песочницы: канвас не отдаёт ни DOM-узлов,
// ни ролей, и достать из него состояние иначе нечем.

interface El {
  id: string;
  px: number;
  py: number;
  z: number;
}

const state = (page: Page): Promise<El[]> =>
  page.evaluate(() => {
    const s = (window as unknown as { __kit: { scene: KitSceneLike } }).__kit.scene;
    return s.testHooks().elements.map((e) => {
      const el = s.element(e.id)!;
      return { id: e.id, px: Math.round(el.body.px), py: Math.round(el.body.py), z: el.root.zIndex };
    });
  });

interface KitSceneLike {
  testHooks(): { elements: { id: string }[]; camera: { x: number; y: number; zoom: number } };
  element(id: string): { body: { px: number; py: number }; root: { zIndex: number } } | undefined;
}

/**
 * КОНТЕНТ → ЭКРАН. Канвас занимает весь кадр, а витрина стоит в нём по центру и при нехватке места
 * ужимается — значит координата предмета и координата пальца это разные вещи. Перевод берём у
 * камеры, а не считаем в тесте: иначе он разойдётся с движком при первой же правке вписывания.
 * Камера — из ДЕВ-ХУКА: у сцены-делегата своего вьюпорта нет, он принадлежит движку.
 */
const toScreen = (page: Page, p: { x: number; y: number }): Promise<{ x: number; y: number }> =>
  page.evaluate((pt) => {
    const v = (window as unknown as { __kit: { scene: KitSceneLike } }).__kit.scene.testHooks().camera;
    return { x: v.x + pt.x * v.zoom, y: v.y + pt.y * v.zoom };
  }, p);

const at = (els: El[], id: string) => els.find((e) => e.id === id)!;

/** Драг по КАНВАСУ: координаты — в его пикселях, как их видит палец. */
const drag = async (page: Page, fromContent: { x: number; y: number }, toContent: { x: number; y: number }) => {
  const box = (await page.locator("canvas").boundingBox())!;
  const from = await toScreen(page, fromContent);
  const to = await toScreen(page, toContent);
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + from.x + ((to.x - from.x) * i) / 10, box.y + from.y + ((to.y - from.y) * i) / 10);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(900); // дать пружинам доехать
};

const open = async (page: Page, id: string, args = "") => {
  await page.goto(`/iframe.html?id=${id}&viewMode=story${args ? `&args=${args}` : ""}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
};

test.describe("витрина каталога — живой движок", () => {
  test.use({ viewport: { width: 900, height: 800 } });

  // Клетки доски: 4 колонки, шаг 99, центр первой (82, 82) — те же числа, что видит палец.
  const CELL = 99;
  const slot = (col: number, row: number) => ({ x: 82 + col * CELL, y: 82 + row * CELL });

  test("«переместить» значит «теперь предмет ЖИВЁТ здесь»: дом переезжает вместе с ним", async ({ page }) => {
    // Пока команда двигала только тело, возврат из драга тянул фигуру на СТАРЫЙ дом, и дроп
    // выглядел как «не работает»: фигура доезжала до клетки и уползала обратно.
    await open(page, "mechanics-field-zone--field-zone");
    await drag(page, slot(0, 0), slot(0, 1));
    const after = at(await state(page), "bz-0");
    expect(after).toMatchObject({ px: slot(0, 1).x, py: slot(0, 1).y });

    // И ГЛАВНОЕ: следующий драг стартует уже от нового дома, а не от старого.
    await drag(page, slot(0, 1), slot(1, 1));
    expect(at(await state(page), "bz-0")).toMatchObject({ px: slot(1, 1).x, py: slot(1, 1).y });
  });

  test("дроп разрешается по координате ПАЛЬЦА, а не по отстающему телу", async ({ page }) => {
    // Тело едет пружиной и в момент отпускания отстаёт на пол-клетки: на ЗАНЯТОЙ клетке оно
    // попадало в зазор между слотами, и обмен молча не случался.
    await open(page, "mechanics-field-zone--field-zone");
    const before = await state(page);
    await drag(page, slot(0, 0), slot(1, 0));
    const after = await state(page);
    expect(at(after, "bz-0")).toMatchObject({ px: slot(1, 0).x, py: slot(1, 0).y });
    expect(at(after, "bz-1")).toMatchObject({ px: at(before, "bz-0").px, py: at(before, "bz-0").py });
  });

  test("правило приёма — последний гейт: на чужой цвет фигура не встаёт", async ({ page }) => {
    await open(page, "mechanics-field-zone--field-zone", "rule:sameColor");
    const home = at(await state(page), "bz-0");
    await drag(page, slot(0, 0), slot(0, 1)); // соседняя клетка другого цвета
    expect(at(await state(page), "bz-0")).toMatchObject({ px: home.px, py: home.py });
    await drag(page, slot(0, 0), slot(1, 1)); // по диагонали — свой цвет
    expect(at(await state(page), "bz-0")).toMatchObject({ px: slot(1, 1).x, py: slot(1, 1).y });
  });

  test("глубина возвращается ПО ПРИЛЁТУ: карта не ныряет под соседей всю дорогу домой", async ({ page }) => {
    // Пока глубина ставилась сразу на отпускании, отпущенная карта весь полёт ехала ПОД теми,
    // что лежат на столе: физически бессмыслица — она в воздухе.
    await open(page, "ui-kit-stack--default");
    const els = await state(page);
    const top = els[els.length - 1]!;
    const box = (await page.locator("canvas").boundingBox())!;
    const grip = await toScreen(page, { x: top.px, y: top.py });
    const drop = await toScreen(page, { x: top.px + 120, y: top.py + 60 });
    await page.mouse.move(box.x + grip.x, box.y + grip.y);
    await page.mouse.down();
    await page.mouse.move(box.x + drop.x, box.y + drop.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(60); // сразу после отпускания — ещё в полёте
    const midFlight = at(await state(page), top.id);
    expect(midFlight.z).toBeGreaterThan(Math.max(...els.filter((e) => e.id !== top.id).map((e) => e.z)));
    await page.waitForTimeout(1200); // долетела
    expect(at(await state(page), top.id).z).toBe(top.z);
  });
});

test.describe("витрина каталога — появление это СОБЫТИЕ доски", () => {
  test.use({ viewport: { width: 900, height: 800 } });

  test("правка рычага не переигрывает появление: иначе раздел мигает на каждый сдвиг ползунка", async ({ page }) => {
    await page.goto("/iframe.html?id=ui-kit-card--card&viewMode=story");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900); // появление на первой сборке успевает доиграть

    const alive = () =>
      page.evaluate(() => {
        const s = (window as unknown as { __kit: { scene: { testHooks(): { elements: { id: string }[] }; element(id: string): { root: { alpha: number }; resting: boolean } | undefined } } }).__kit.scene;
        const id = s.testHooks().elements[0]!.id;
        const el = s.element(id)!;
        return { id, alpha: el.root.alpha, resting: el.resting };
      });

    const before = await alive();
    expect(before.alpha).toBeCloseTo(1, 2);
    expect(before.resting).toBe(true);

    // Крутим рычаг ровно так, как это делает панель.
    await page.evaluate(() => {
      const ch = (window as unknown as { __STORYBOOK_ADDONS_CHANNEL__: { emit(e: string, p: unknown): void } }).__STORYBOOK_ADDONS_CHANNEL__;
      ch.emit("updateStoryArgs", { storyId: "ui-kit-card--card", updatedArgs: { fourColor: true } });
    });
    // Момент, в который появление было бы ВИДНО: сразу после пересборки.
    await page.waitForTimeout(180);

    const after = await alive();
    // Карта не должна ни гаснуть, ни ползти: появление здесь никто не звал.
    expect(after.alpha).toBeCloseTo(1, 2);
    expect(after.resting).toBe(true);
  });
});
