// ЖУРНАЛ ПАРТИИ: открывается, пишет только видимое и ПРОКРУЧИВАЕТСЯ ПАЛЬЦЕМ.
//
// Прокрутка проверяется живьём, потому что ломается она невидимо: `touch-action` у окна правильный,
// разметка правильная, а палец не работает — отмену жеста ему вешает стол (`keepPage`), чтобы
// Телеграм не закрыл приложение свайпом. Ни один тест разметки этого не поймает.
//   node scripts/tableJournal.mjs [base] [shot.png]
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2590";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("ERROR", e.message));
await page.goto(`${base}/table/?stand`);
await page.waitForSelector("[data-section]");
await page.waitForTimeout(1200);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

// Сделать ход, чтобы журналу было что писать.
const card = await page.locator("[data-card]").first().boundingBox();
const start = [card.x + card.width / 2, card.y + card.height / 2];
await touch("touchStart", [start]);
for (let i = 1; i <= 10; i += 1) await touch("touchMove", [[start[0], start[1] - i * 28]]);
await touch("touchEnd", []);
await page.waitForTimeout(800);

await page.click("[data-journal]");
await page.waitForTimeout(500);
const окно = page.locator('[data-g="journal"]');
check("журнал открылся", await окно.count() > 0);

const строки = await page.evaluate(() => [...document.querySelectorAll('[data-g="journal"] > div')].slice(1).map((d) => d.textContent.trim()));
check("в журнале есть запись о ходе", строки.length > 0, строки);

// ИМЯ КОМНАТЫ ПО ЦЕНТРУ ЭКРАНА, а не по центру того, что осталось между кнопками.
const имя = await page.evaluate(() => {
  const el = document.querySelector("[data-table-name] span");
  const r = el.getBoundingClientRect();
  return { центр: Math.round(r.left + r.width / 2), экран: Math.round(window.innerWidth / 2) };
});
check("имя комнаты по центру экрана (±2px)", Math.abs(имя.центр - имя.экран) <= 2, имя);

// ПРОКРУТКА. Окно переполняем нарочно: проверяем не «много ли записей», а отдаёт ли стол палец.
await page.evaluate(() => (document.querySelector(String.raw`[data-g="journal"]`).style.maxHeight = "44px"));
await page.waitForTimeout(200);
const мера = () => page.evaluate(() => {
  const el = document.querySelector('[data-g="journal"]');
  return { сверху: Math.round(el.scrollTop), всего: el.scrollHeight, видно: el.clientHeight };
});
const было = await мера();
check("окно переполнено — есть что прокручивать", было.всего > было.видно, было);
const box = await окно.boundingBox();
const x = box.x + box.width / 2;
const y0 = box.y + box.height * 0.7;
await touch("touchStart", [[x, y0]]);
for (let i = 1; i <= 12; i += 1) await touch("touchMove", [[x, y0 - i * 14]]);
await touch("touchEnd", []);
await page.waitForTimeout(700);
const стало = await мера();
check("ПАЛЕЦ ПРОКРУЧИВАЕТ ЖУРНАЛ", стало.сверху > было.сверху, { было, стало });

await page.screenshot({ path: process.argv[3] ?? "journal.png" });
await browser.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
if (checks.some((c) => !c.ok)) process.exitCode = 1;
