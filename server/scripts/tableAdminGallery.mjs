// СТРАНИЦА ХОЗЯИНА — «Спрайты» → «Все спрайты»: каждая нарисованная сторона каждой детали каталога испечена и видна,
// фильтр по детали и по источнику, тап — крупно в трёх расцветках; нарисованное, но не принятое в каталог, — в «Не в
// каталоге». Без ключа список файлов закрыт.
//   node scripts/tableAdminGallery.mjs [base] [secret] [shot.png]
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2611";
const secret = process.argv[3] ?? "probe";
const shot = process.argv[4];
const LOOSE = join(resolve(import.meta.dirname, "../.."), "design/persona/skins", `zzloose${Date.now().toString(36)}`);
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

await mkdir(LOOSE, { recursive: true });
await writeFile(join(LOOSE, "front-hair.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="20" y="40" width="60" height="40" fill="#b3221f" stroke="#0b0704" stroke-width="3"/></svg>`);
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
try {
  await p.goto(`${base}/table/admin#key=${encodeURIComponent(secret)}`);
  await p.waitForSelector(".sg .cell");
  await p.waitForFunction(() => document.querySelectorAll(".sg .cell .wait").length === 0, null, { timeout: 20_000 }).catch(() => {});
  const cells = await p.locator(".sg .cell").count();
  check("все стороны всех деталей на месте", cells >= 60, cells);
  check("все испеклись — нет «пеку…»", (await p.locator(".sg .cell .wait").count()) === 0 && (await p.locator(".sg .cell img").count()) === cells, await p.locator(".sg .cell .wait").count());
  await p.click('[data-gslot="legs"]');
  const legs = await p.locator(".sg .cell b").allTextContents();
  check("фильтр по детали — только ноги", legs.length > 0 && legs.every((t) => t === "Ноги"), legs);
  await p.click('[data-gslot="all"]');
  await p.click('[data-gsrc="loose"]');
  await p.waitForFunction((dir) => document.querySelector(`[data-group="${dir}"]`) !== null, LOOSE.split("/").pop(), { timeout: 5000 }).catch(() => {});
  check("нарисованное, но не принятое — в «Не в каталоге»", (await p.locator(`[data-group="${LOOSE.split("/").pop()}"] .cell img`).count()) === 1, await p.locator(".sg").innerText());
  await p.click('[data-gsrc="court"]');
  await p.locator(".sg .cell").first().click();
  await p.waitForSelector("[data-look]");
  await p.waitForFunction(() => [...document.querySelectorAll("[data-look] .big img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(200);
  const fits = await p.evaluate(() => { const box = document.querySelector("[data-look] .box").getBoundingClientRect(); return box.left >= 8 && box.right <= innerWidth - 8 && [...document.querySelectorAll("[data-look] .big img")].every((i) => i.getBoundingClientRect().right <= box.right); });
  check("крупный вид влезает в экран телефона, с полями по краям", fits, null);
  check("тап — крупно в трёх расцветках, с файлом и ракурсами", (await p.locator("[data-look] .big img").count()) === 3 && /колода/.test(await p.locator("[data-look] dl").innerText()), await p.locator("[data-look]").innerText());
  if (shot) await p.screenshot({ path: shot });
  await p.click("[data-look] [data-close]");
  check("закрывается", (await p.locator("[data-look]").count()) === 0, null);
  check("без ключа список файлов закрыт", (await fetch(`${base}/table/admin/sprites/files`)).status === 403, null);
  check("из адреса наружу не выйти", (await fetch(`${base}/table/admin/sprites/files/drawn/..%2F..%2Fserver/package.json`, { headers: { "x-table-secret": secret } })).status === 404, null);
  check("без ошибок на странице", errors.length === 0, errors);
} finally {
  await browser.close();
  await rm(LOOSE, { recursive: true, force: true });
}
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${JSON.stringify(c.got).slice(0, 400)}`}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
