// Снимки настоящей сцены игры для карточек стенда: `node design/zones/shoot.mjs` (нужны dev-сервер игры :9590, сервер стола :2591 для картинок карт и стенд :9588).
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const require = createRequire(new URL("../../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url)), out = path.join(here, "shots");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const shots = JSON.parse(process.argv[2] ?? "null") ?? [];
for (const sh of shots) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://localhost:9588/harness.html"); await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await page.evaluate((s) => window.__setup(s), sh.setup);
  if (sh.full) { await page.screenshot({ path: path.join(out, `${sh.name}.png`), clip: { x: 0, y: sh.y ?? 120, width: 390, height: sh.h ?? 520 } }); console.log(sh.name, errs.join("|")); await page.close(); continue; }
  const at = await page.evaluate(([chair]) => { const st = window.__store.state; const c = st.chairs.find((x) => x.id === chair); const id = c.hand[0]?.id ?? st.piles[0].cards[0].id; return window.__scene.test.screenOf(id); }, [sh.focus]);
  const w = sh.w ?? 180, h = sh.h ?? 180;
  const clip = { x: Math.max(0, Math.min(390 - w, at.x - w / 2)), y: Math.max(0, Math.min(844 - h, at.y - h / 2 + (sh.dy ?? 20))), width: w, height: h };
  await page.screenshot({ path: path.join(out, `${sh.name}.png`), clip });
  console.log(sh.name, JSON.stringify(at), errs.join("|"));
  await page.close();
}
await browser.close();
