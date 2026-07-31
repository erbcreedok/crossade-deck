import { test, expect, type Page } from "@playwright/test";

// ЕДИНАЯ СИСТЕМА КООРДИНАТ СЦЕНЫ (issue #68) + РЕАКЦИЯ НА РЕСАЙЗ (issue #49).
//
// Контракт после фикса (см. client2/SCALE-DESIGN.md):
//  1. Размер карты приходит из КОНФИГА (constants.SANDBOX_CARD_H) и одинаков на любом экране.
//     Раньше он считался как clamp(48, min(W,H)*0.16, 140) и гулял в 2.19×, тогда как кегли —
//     константы; отсюда «текст относительно карты вдвое крупнее на телефоне».
//  2. Отсюда отношение кегль/карта постоянно ПО ПОСТРОЕНИЮ — его и проверяем, а не абсолютный px.
//  3. Экран меняется — за ним следуют канвас, хит-зона и камера, но НЕ геометрия контента.
//  4. Контент прижат к левой опоре, а не центрируется: центрирование заставляло раскладку
//     прыгать вбок при каждом изменении ширины окна (открыли консоль сайдбаром — уехало и не вернулось).
//
// Меряем в координатах контента: и подписи, и карты лежат в одном контейнере, который множится на
// viewport.zoom, поэтому зум в отношении сокращается. Внутренности движка private только для
// TypeScript — в рантайме доступны через дев-хук window.__fd, как в board.spec/selection.spec.

type Label = { text: string; fontSize: number; scaleX: number };
type Probe = {
  cardW: number;
  cardH: number;
  contentX: number;
  screenW: number;
  screenH: number;
  zoom: number;
  labels: Label[];
};

const MOBILE = { width: 390, height: 844 }; // iPhone 13
const DESKTOP = { width: 1440, height: 900 };

const VIEWPORTS = [
  { name: "iPhone 13", ...MOBILE },
  { name: "узкое 360", width: 360, height: 720 },
  { name: "iPad Pro 11", width: 834, height: 1194 },
  { name: "десктоп 1440", ...DESKTOP },
];

const settle = async (page: Page) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
};

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const fd = (
      window as unknown as {
        __fd: {
          cardW: number;
          cardH: number;
          // Размер экрана движок держит ОДИН раз — в CanvasApp (width/height). У песочницы был свой
          // дубль W/H; с выносом общего слоя сцены (sceneEngine.ts) он убран, проба читает канон.
          width: number;
          height: number;
          content: { x: number };
          viewport: { zoom: number };
          app: { stage: unknown };
        };
      }
    ).__fd;

    const labels: Label[] = [];
    type Node = { text?: unknown; style?: { fontSize?: unknown }; scale?: { x?: number }; children?: Node[] };
    const walk = (n: Node | null | undefined): void => {
      if (!n) return;
      if (typeof n.text === "string" && n.style && typeof n.style.fontSize === "number") {
        labels.push({ text: n.text, fontSize: n.style.fontSize, scaleX: n.scale?.x ?? 1 });
      }
      for (const c of n.children ?? []) walk(c);
    };
    walk(fd.app.stage as Node);

    return {
      cardW: fd.cardW,
      cardH: fd.cardH,
      contentX: fd.content.x,
      screenW: fd.width,
      screenH: fd.height,
      zoom: fd.viewport.zoom,
      labels,
    };
  });
}

async function probeAt(page: Page, size: { width: number; height: number }): Promise<Probe> {
  await page.setViewportSize(size);
  await page.goto("/playground");
  await settle(page);
  return probe(page);
}

const eff = (l: Label) => l.fontSize * l.scaleX;
const canvasBox = async (page: Page) => (await page.locator(".table-host canvas").boundingBox())!;

test.describe("единая система координат сцены", () => {
  test("issue #68: карта одинакова на всех экранах, кегль держит к ней постоянное отношение", async ({ page }) => {
    const taken: { name: string; p: Probe }[] = [];
    for (const v of VIEWPORTS) taken.push({ name: v.name, p: await probeAt(page, { width: v.width, height: v.height }) });

    // Предусловие: экраны реально разные — иначе проверять нечего.
    const screens = taken.map((t) => t.p.screenW);
    expect(Math.max(...screens) - Math.min(...screens), "вьюпорты действительно различаются").toBeGreaterThan(500);

    // 1. Карта — из конфига, значит одинаковая везде. Это и есть корень #68.
    const cards = taken.map((t) => `${t.name}: ${t.p.cardW.toFixed(2)}`);
    const w = taken.map((t) => t.p.cardW);
    expect(Math.max(...w) - Math.min(...w), `размер карты не зависит от экрана — ${cards.join(", ")}`).toBeLessThan(0.5);

    // 2. Кегль относительно карты — постоянен. Одна и та же надпись («вкл», «переместить сюда»)
    // встречается в сцене НЕСКОЛЬКО раз и на разных кеглях (кнопки sm/md), поэтому сопоставляем не
    // «текст → размер», а текст → ОТСОРТИРОВАННЫЙ набор размеров: иначе дубликаты затирают друг
    // друга и тест ловит собственный артефакт вместо расхождения.
    const ratios = (p: Probe): Map<string, number[]> => {
      const m = new Map<string, number[]>();
      for (const l of p.labels) {
        if (l.text.trim().length <= 1) continue;
        const arr = m.get(l.text) ?? [];
        arr.push(eff(l) / p.cardW);
        m.set(l.text, arr);
      }
      for (const arr of m.values()) arr.sort((a, b) => a - b);
      return m;
    };

    const ref = taken[0]!;
    const refRatio = ratios(ref.p);
    expect(refRatio.size, "подписи найдены").toBeGreaterThan(5);

    const offenders: string[] = [];
    for (const t of taken.slice(1)) {
      for (const [text, mine] of ratios(t.p)) {
        const r = refRatio.get(text);
        if (!r || r.length !== mine.length) continue; // набор подписей на экране может отличаться
        mine.forEach((v, i) => {
          if (Math.abs(v - r[i]!) / r[i]! > 0.02) offenders.push(`${t.name} «${text}»: ${v.toFixed(3)} против ${r[i]!.toFixed(3)}`);
        });
      }
    }
    expect(offenders, "кегль относительно карты одинаков на всех экранах").toEqual([]);
  });

  test("issue #68: подписи одного уровня не разъезжаются между собой на узком экране", async ({ page }) => {
    // Сторож на ужимание в label(): t.scale.set(wrap / t.width) срабатывает у разных подписей на
    // разный коэффициент. На момент фикса разъезда нет — тест держит это свойство.
    await probeAt(page, { width: 360, height: 720 });
    const p = await probe(page);

    const levels = new Map<number, number[]>();
    for (const l of p.labels) {
      if (l.text.trim().length <= 1) continue;
      const arr = levels.get(l.fontSize) ?? [];
      arr.push(eff(l));
      levels.set(l.fontSize, arr);
    }

    const broken: string[] = [];
    for (const [declared, sizes] of levels) {
      if (sizes.length < 3) continue;
      const min = Math.min(...sizes);
      const max = Math.max(...sizes);
      if (max / min > 1.05) broken.push(`уровень ${declared}px: фактический разброс ${min.toFixed(1)}…${max.toFixed(1)}`);
    }
    expect(broken, "подписи одного уровня имеют один фактический размер").toEqual([]);
  });

  test("issue #49: канвас и камера следуют за размером окна", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/playground");
    await settle(page);

    const before = await probe(page);
    expect((await canvasBox(page)).width, "стартовая ширина канваса").toBeGreaterThanOrEqual(MOBILE.width - 2);

    // Расширяем окно уже ПОСЛЕ загрузки — именно это ломалось: размер читался один раз на mount.
    await page.setViewportSize(DESKTOP);
    await page.waitForTimeout(900);
    const after = await probe(page);

    expect((await canvasBox(page)).width, "канвас растянулся на новую ширину").toBeGreaterThanOrEqual(DESKTOP.width - 2);
    expect(after.screenW, "движок узнал новую ширину").toBeGreaterThan(before.screenW + 500);
    // Геометрия контента при этом НЕ едет: размер карты — конфиг, а не производная экрана.
    expect(after.cardW, "карта не прыгает при ресайзе").toBeCloseTo(before.cardW, 5);
  });

  test("issue #49: контент прижат к левой опоре и не уезжает в центр при сужении окна", async ({ page }) => {
    // Симуляция жалобы владельца: открыли консоль сайдбаром — ширина упала, раскладка «улетела в
    // центр и не вернулась». Центрирование заменено на левую опору (Viewport alignX="left").
    await page.setViewportSize(DESKTOP);
    await page.goto("/playground");
    await settle(page);
    const wide = await probe(page);
    expect(wide.contentX, "на широком экране контент прижат влево, а не отцентрован").toBeLessThanOrEqual(1);

    await page.setViewportSize({ width: 900, height: 900 }); // «сайдбар консоли» съел ширину
    await page.waitForTimeout(900);
    const narrow = await probe(page);
    expect(narrow.contentX, "после сужения контент остался у левой опоры").toBeLessThanOrEqual(1);

    await page.setViewportSize(DESKTOP); // вернули ширину — опора та же
    await page.waitForTimeout(900);
    const back = await probe(page);
    expect(back.contentX, "после возврата ширины опора не уплыла").toBeCloseTo(wide.contentX, 1);
  });
});
