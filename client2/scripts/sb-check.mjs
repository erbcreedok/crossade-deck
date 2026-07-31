// Проверка каталога В БРАУЗЕРЕ. Обязательный шаг: зелёные юниты про канвас не значат ничего —
// Pixi в node не исполняется, и «сцена собралась» в них попросту не проверяется (docs/HANDOFF.md).
//
// Запуск (сторибук должен быть уже поднят: npm run storybook):
//   node scripts/sb-check.mjs                      # все стори каталога
//   node scripts/sb-check.mjs id-стори id-стори    # только названные
//
// Что меряет:
//   • утечку WebGL-контекстов — обходит стори БЕЗ перезагрузки превью (штатная смена стори по
//     каналу Storybook) и следит за __kit.pool.stats(). Здоровый признак: created растёт только
//     когда стори просит ДРУГИЕ опции сцены, а не на каждое переключение;
//   • что стори реально что-то рисует и рисует РАЗНОЕ — по хэшу кадра канваса;
//   • что метки-грипы на месте и за них тянется вся пачка (--drag);
//   • ошибки консоли и необработанные исключения превью.

import { chromium } from "playwright";
import crypto from "node:crypto";

const HOST = process.env.SB_HOST ?? "http://localhost:6006";
const argv = process.argv.slice(2);
const withDrag = argv.includes("--drag");
const ids = argv.filter((a) => !a.startsWith("--"));

async function allStoryIds() {
  const res = await fetch(`${HOST}/index.json`);
  if (!res.ok) throw new Error(`сторибук не отвечает на ${HOST}/index.json (${res.status})`);
  return Object.keys((await res.json()).entries);
}

const targets = ids.length ? ids : await allStoryIds();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
let reloads = -1; // первая загрузка — законная
page.on("load", () => reloads++);

await page.goto(`${HOST}/iframe.html?id=${encodeURIComponent(targets[0])}&viewMode=story`, { waitUntil: "load" });
await page.waitForTimeout(2500);

const stats = () =>
  page.evaluate(() => {
    const s = globalThis.__kit?.pool?.stats?.() ?? {};
    return { created: s.created ?? null, live: s.live ?? null, idle: s.idle ?? null, disposed: s.disposed ?? null, canvases: document.querySelectorAll("canvas").length };
  });

const rows = [];
for (const id of targets) {
  await page.evaluate((sid) => window.__STORYBOOK_ADDONS_CHANNEL__.emit("setCurrentStory", { storyId: sid, viewMode: "story" }), id);
  await page.waitForTimeout(1600);
  const shot = await page.locator("canvas").first().screenshot();
  const s = await stats();
  const hooks = await page.evaluate(() => {
    const h = globalThis.__kit?.scene?.testHooks?.();
    return h ? { elements: h.elements.length, zones: Object.keys(h.zones).length, buttons: h.buttons.length, grips: h.grips.length } : {};
  });
  rows.push({ id, ...s, ...hooks, frame: crypto.createHash("sha1").update(shot).digest("hex").slice(0, 10) });
}

console.table(rows);
const unique = new Set(rows.map((r) => r.frame)).size;
console.log(`стори: ${rows.length}, разных кадров: ${unique}, перезагрузок превью: ${reloads}`);
console.log(`контекстов создано: ${rows.at(-1)?.created} (потолок браузера ~16); канвасов в документе одновременно: ${Math.max(...rows.map((r) => r.canvases))}`);

if (withDrag) {
  // Доказать МЕХАНИКУ, а не картинку: «ничего не изменилось» одинаково выглядит и при работающем
  // запрете, и при полностью мёртвом драге.
  const target = rows.find((r) => r.grips > 0);
  if (!target) console.log("\n--drag: стори с метками не нашлось — пропускаю");
  else {
    await page.evaluate((sid) => window.__STORYBOOK_ADDONS_CHANNEL__.emit("setCurrentStory", { storyId: sid, viewMode: "story" }), target.id);
    await page.waitForTimeout(1600);
    const snap = () => page.evaluate(() => globalThis.__kit.scene.testHooks().elements.map((e) => ({ id: e.id, x: e.x, y: e.y, state: e.state })));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const grips = await page.evaluate(() => globalThis.__kit.scene.testHooks().grips);
    // Каждую метку — по очереди: сколько элементов она уводит. Соло-метка обязана увести ОДИН,
    // метка пачки — все её. Один общий счётчик тут врал бы: «уехал 1» — это и правильный соло-грип,
    // и сломанный грип пачки.
    const drags = [];
    for (let gi = 0; gi < grips.length; gi++) {
      const fresh = await page.evaluate(() => globalThis.__kit.scene.testHooks().grips);
      const g = fresh[gi];
      const before = await snap();
      await page.mouse.move(g.x, g.y);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(g.x + i * 18, g.y - i * 6);
      await page.waitForTimeout(400);
      const during = await snap();
      await page.mouse.up();
      await page.waitForTimeout(1200);
      const after = await snap();
      drags.push({
        grip: gi,
        moved: during.filter((d) => dist(d, before.find((b) => b.id === d.id) ?? d) > 20).length,
        dragging: during.filter((d) => d.state === "drag").length,
        home: after.filter((d) => dist(d, before.find((b) => b.id === d.id) ?? { x: 1e9, y: 1e9 }) < 6).length,
        total: before.length,
      });
    }
    console.log(`\n--drag на «${target.id}»:`);
    console.table(drags);
  }
}

console.log(`\nошибки консоли: ${errors.length ? "\n  " + errors.join("\n  ") : "нет"}`);
await browser.close();
process.exit(errors.length ? 1 : 0);
