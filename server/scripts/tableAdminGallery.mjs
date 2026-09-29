// СТРАНИЦА ХОЗЯИНА — «Спрайты» → «Все спрайты»: плоская библиотека картинок. Загрузить SVG / PNG — картинка в «Своих»
// со своим именем; SVG со скриптом не берётся; поиск по имени; встроенные (колода, файлы, код) — рядом, испечены;
// тап — крупно в трёх расцветках, влезает в телефон; свою — переименовать и удалить. Без ключа библиотека закрыта.
//   node scripts/tableAdminGallery.mjs [base] [secret] [shot.png]
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2611";
const secret = process.argv[3] ?? "probe";
const shot = process.argv[4];
const tag = `zz${Date.now().toString(36)}`;
const good = join(tmpdir(), `${tag}-лис.svg`), evil = join(tmpdir(), `${tag}-зло.svg`);
await writeFile(good, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#b3221f" stroke="#0b0704" stroke-width="3"/></svg>`);
await writeFile(evil, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>`);
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const own = async () => (await (await fetch(`${base}/table/admin/lib`, { headers: { "x-table-secret": secret } })).json()).sprites.filter((x) => x.name.startsWith(tag));

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("dialog", (d) => d.accept());
try {
  await p.goto(`${base}/table/admin#key=${encodeURIComponent(secret)}`);
  await p.waitForSelector(".sg .cell");
  await p.waitForFunction(() => document.querySelectorAll(".sg .cell .wait").length === 0, null, { timeout: 20_000 }).catch(() => {});
  const cells = await p.locator(".sg .cell").count();
  check("встроенные на месте и испечены", cells >= 60 && (await p.locator(".sg .cell .wait").count()) === 0, cells);
  await p.setInputFiles("[data-file]", [good, evil]);
  await p.waitForFunction(() => /Загружено/.test(document.querySelector("[data-said]")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {});
  const said = await p.textContent("[data-said]");
  check("чистый SVG взят, со скриптом — нет, и сказано почему", /Загружено 1/.test(said) && /unsafe_svg/.test(said), said);
  const mine = await own();
  check("в библиотеке — одна картинка, имя из файла", mine.length === 1 && mine[0].name === `${tag}-лис` && mine[0].origin === "upload", mine);
  const file = await fetch(`${base}/table/lib/${mine[0].id}.svg`);
  check("файл отдаётся всем, открытый напрямую ничего не исполняет", file.status === 200 && /default-src 'none'/.test(file.headers.get("content-security-policy") ?? ""), file.headers.get("content-security-policy"));
  await p.click('[data-which="own"]');
  await p.fill("[data-q]", tag);
  check("«Свои» и поиск — только она", (await p.locator(".sg .cell").count()) === 1 && (await p.locator(".sg .cell i").innerText()) === "загружен", await p.locator(".sg .grid").innerText());
  await p.locator(".sg .cell").first().click();
  await p.waitForSelector("[data-look] .big img");
  await p.waitForFunction(() => [...document.querySelectorAll("[data-look] .big img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 5000 }).catch(() => {});
  const fits = await p.evaluate(() => { const box = document.querySelector("[data-look] .box").getBoundingClientRect(); return box.left >= 8 && box.right <= innerWidth - 8 && [...document.querySelectorAll("[data-look] .big img")].every((i) => i.getBoundingClientRect().right <= box.right); });
  check("крупно в трёх расцветках, влезает в телефон с полями", (await p.locator("[data-look] .big img").count()) === 3 && fits, null);
  if (shot) await p.screenshot({ path: shot });
  await p.fill("[data-look] [data-name]", `${tag} Лис`);
  await p.click("[data-look] [data-save]");
  await p.waitForTimeout(500);
  check("переименовать", (await own())[0]?.name === `${tag} Лис`, await own());
  await p.locator(".sg .cell").first().click();
  await p.click("[data-look] [data-drop]");
  await p.waitForTimeout(500);
  check("удалить — и файла больше нет", (await own()).length === 0 && (await fetch(`${base}/table/lib/${mine[0].id}.svg`)).status === 404, await own());
  await p.fill("[data-q]", "");
  await p.click('[data-which="built"]');
  await p.locator(".sg .cell").first().click();
  check("встроенную не удалить", (await p.locator("[data-look] [data-drop]").count()) === 0 && /не удаляется/.test(await p.locator("[data-look]").innerText()), null);
  await p.click("[data-look] [data-close]");
  check("без ключа библиотека закрыта", (await fetch(`${base}/table/admin/lib`)).status === 403, null);
  check("без ошибок на странице", errors.length === 0, errors);
} finally {
  await browser.close();
  for (const x of await own()) await fetch(`${base}/table/admin/lib/${x.id}`, { method: "DELETE", headers: { "x-table-secret": secret } });
}
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${JSON.stringify(c.got).slice(0, 400)}`}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
