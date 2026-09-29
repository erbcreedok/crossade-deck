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
  // ПОЛКИ: деталь, сторона, тег — у встроенных из каталога
  await p.click('[data-kind="legs"]');
  const legs = await p.locator(".sg .cell i").allTextContents();
  check("полка «Ноги» — только ноги", legs.length > 0 && legs.every((t) => t.startsWith("ноги")), legs);
  await p.click('[data-kind="head"]');
  await p.click('[data-side="back"]');
  const backs = await p.locator(".sg .cell i").allTextContents();
  check("голова + спина — только затылки голов", backs.length > 0 && backs.every((t) => t.startsWith("голова · спина")), backs);
  await p.selectOption("[data-tag]", "Король треф");
  const kings = await p.locator(".sg .cell b").allTextContents();
  check("тег «Король треф» — только его картинки", kings.length === 1 && kings[0].startsWith("Король треф"), kings);
  await p.selectOption("[data-tag]", "");
  await p.click('[data-side="front"]');
  check("загрузка ляжет туда, что выбрано", /голова · лицо/.test(await p.textContent("[data-into]")), await p.textContent("[data-into]"));
  await p.setInputFiles("[data-file]", [good, evil]);
  await p.waitForFunction(() => /Загружено/.test(document.querySelector("[data-said]")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {});
  const said = await p.textContent("[data-said]");
  check("чистый SVG взят, со скриптом — нет, и сказано почему", /Загружено 1/.test(said) && /unsafe_svg/.test(said), said);
  const mine = await own();
  check("в библиотеке — одна картинка, имя из файла, деталь и сторона — из полок", mine.length === 1 && mine[0].name === `${tag}-лис` && mine[0].origin === "upload" && mine[0].slot === "head" && mine[0].side === "front", mine);
  const file = await fetch(`${base}/table/lib/${mine[0].id}.svg`);
  check("файл отдаётся всем, открытый напрямую ничего не исполняет", file.status === 200 && /default-src 'none'/.test(file.headers.get("content-security-policy") ?? ""), file.headers.get("content-security-policy"));
  await p.click('[data-which="own"]');
  await p.fill("[data-q]", tag);
  check("«Свои» и поиск — только она", (await p.locator(".sg .cell").count()) === 1 && (await p.locator(".sg .cell i").innerText()) === "голова · лицо · загружен", await p.locator(".sg .grid").innerText());
  // СТРАНИЦА СПРАЙТА: своя картинка
  await p.locator(".sg .cell").first().click();
  await p.waitForSelector("[data-sprite-page] [data-big][src]");
  check("тап — страница спрайта вместо галереи", (await p.locator("[data-list]").isHidden()) && (await p.locator("[data-sprite-page]").count()) === 1, null);
  const st = await p.locator("[data-stage3d]").boundingBox();
  const ry0 = await p.getAttribute("[data-stage3d]", "data-ry");
  await p.mouse.move(st.x + st.width / 2, st.y + st.height / 2);
  await p.mouse.down();
  await p.mouse.move(st.x + st.width / 2 + 100, st.y + st.height / 2 - 40, { steps: 5 });
  await p.mouse.up();
  check("крутится пальцем", (await p.getAttribute("[data-stage3d]", "data-ry")) !== ry0, [ry0, await p.getAttribute("[data-stage3d]", "data-ry")]);
  const src0 = await p.getAttribute("[data-big]", "src");
  await p.click('[data-pal16="5"]');
  const src1 = await p.getAttribute("[data-big]", "src");
  check("расцветка меняет картинку; все 16 — рядом", src1 !== src0 && (await p.locator("[data-pal16] img[src]").count()) === 16, null);
  await p.waitForFunction(() => !document.querySelector("[data-c]")?.disabled, null, { timeout: 5000 }).catch(() => {});
  await p.fill('[data-c="0"]', "#ff00aa");
  check("свои цвета красят SVG", decodeURIComponent(await p.getAttribute("[data-big]", "src")).includes("#ff00aa"), null);
  if (shot) await p.screenshot({ path: shot, fullPage: true });
  await p.fill("[data-sprite-page] [data-name]", `${tag} Лис`);
  await p.click('[data-sprite-page] [data-pick-kind] [data-v="hair"]');
  await p.click('[data-sprite-page] [data-pick-side] [data-v=""]');
  await p.fill("[data-sprite-page] [data-tags]", "Лис, звери");
  await p.click("[data-sprite-page] [data-save]");
  await p.waitForTimeout(600);
  const edited = (await own())[0];
  check("переименовать, сменить деталь, сторону, теги", edited?.name === `${tag} Лис` && edited.slot === "hair" && edited.side === null && edited.tags.join() === "Лис,звери", edited);
  await p.click("[data-sprite-page] [data-drop]");
  await p.waitForTimeout(600);
  check("удалить — назад к галерее, файла больше нет", (await own()).length === 0 && (await fetch(`${base}/table/lib/${mine[0].id}.svg`)).status === 404 && (await p.locator("[data-list]").isVisible()), await own());
  // встроенная: король треф, лицо — похожие по тегу, свои цвета недоступны
  await p.fill("[data-q]", "");
  await p.click('[data-which="built"]');
  await p.click('[data-kind="head"]');
  await p.click('[data-side="front"]');
  await p.selectOption("[data-tag]", "Король треф");
  await p.locator(".sg .cell").first().click();
  await p.waitForSelector("[data-sprite-page]");
  await p.waitForFunction(() => /не SVG/.test(document.querySelector("[data-own3-said]")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
  check("встроенную не удалить; у колоды свои цвета не выбрать, и сказано почему", (await p.locator("[data-sprite-page] [data-drop]").count()) === 0 && (await p.locator("[data-c]").first().isDisabled()), await p.textContent("[data-own3-said]"));
  const sims = await p.locator("[data-similar] .cell b").allTextContents();
  check("похожие по тегам — вторая сторона того же короля", sims.includes("Король треф · спина"), sims);
  await p.locator("[data-similar] .cell", { hasText: "Король треф · спина" }).first().click();
  check("тап по похожему — его страница", /Король треф · спина/.test(await p.locator("[data-sprite-page] h2").innerText()), null);
  await p.goBack();
  check("«назад» — к прежнему спрайту", /Король треф · лицо/.test(await p.locator("[data-sprite-page] h2").innerText()), null);
  await p.click("[data-back]");
  check("и ещё назад — галерея", await p.locator("[data-list]").isVisible(), null);
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
