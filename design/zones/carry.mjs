// Настоящие кадры игры: карту несут к стопке на столе (мышью, как палец). `node design/zones/carry.mjs` — нужны :9590, :2591, :9588. Подсветки приёмки в игре пока нет — её рисует страница стенда поверх.
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
const require = createRequire(new URL("../../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [name, dx, dy] of [["carry-away", 80, 60], ["carry-over", 0, 0]]) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })).newPage();
  await page.goto("http://localhost:9588/harness.html"); await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await page.evaluate(() => window.__setup({ mode: "top", pile: { n: 12, x: 0, y: 0 }, zoom: 2 }));
  const at = await page.evaluate(() => { const s = window.__store, st = s.state, mine = st.chairs.find((c) => c.owner === s.me.key), pid = st.piles.find((x) => x.id !== "deck").cards[0].id; return { card: window.__scene.test.screenOf(mine.hand[0].id), pile: window.__scene.test.screenOf(pid) }; });
  await page.mouse.move(at.card.x, at.card.y); await page.mouse.down();
  for (let i = 1; i <= 14; i++) { await page.mouse.move(at.card.x + (at.pile.x + dx - at.card.x) * i / 14, at.card.y + (at.pile.y + dy - at.card.y) * i / 14); await page.waitForTimeout(50); }
  await page.waitForTimeout(700);
  const w = 200, h = 170;
  await page.screenshot({ path: path.join(out, `${name}.png`), clip: { x: at.pile.x - w / 2, y: at.pile.y - h / 2 + 8, width: w, height: h } });
  console.log(name, JSON.stringify(at));
  await page.close();
}
await browser.close();
