// СТРАНИЦА ХОЗЯИНА — РОУТИНГ: всё выбранное живёт в адресе и переживает обновление страницы. Полки галереи,
// открытый спрайт с его поворотом, расцветкой, фоном, масштабом, отражением; «назад / вперёд» — между галереей и
// спрайтом; «Детали» — деталь, на ком, расцветка, сцена, камера стола, несохранённая правка; agy — недописанный бриф.
//   node scripts/tableAdminRoute.mjs [base] [secret]
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2611";
const secret = process.argv[3] ?? "probe";
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const reload = async () => { await p.reload(); await p.waitForTimeout(1500); };
try {
  await p.goto(`${base}/table/admin#key=${encodeURIComponent(secret)}`);
  await p.waitForSelector(".sg .cell");
  // ГАЛЕРЕЯ
  await p.fill("[data-q]", "деталь:голова сторона:спина");
  await p.press("[data-q]", "Enter");
  await p.click('[data-gpal="3"]');
  await p.fill("[data-q]", "король");
  const before = await p.locator(".sg .cell b").allTextContents();
  await reload();
  const after = await p.locator(".sg .cell b").allTextContents();
  check("полки, поиск и расцветка галереи переживают обновление", (await p.locator('[data-chip="gk"] [data-chip-v="head"]').count()) === 1 && (await p.locator('[data-chip="gs"] [data-chip-v="back"]').count()) === 1 && (await p.locator('[data-gpal="3"].on').count()) === 1 && (await p.inputValue("[data-q]")) === "король" && after.join() === before.join() && after.length > 0, { before, after });
  // ОТКРЫТО ПО ССЫЛКЕ С ФИЛЬТРОМ: сцена «Деталей» уже печёт тот же спрайт — галерея всё равно дожидается картинки
  const P2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await P2.goto(`${base}/table/admin#key=${encodeURIComponent(secret)}&part=king%3Ahead&pset=king&gf=${encodeURIComponent('тег:"Король треф" деталь:голова сторона:лицо')}`);
  const baked = await P2.waitForSelector(".sg .cell img", { timeout: 10_000 }).then(() => true).catch(() => false);
  check("по ссылке с фильтром картинка испекается, а не висит «…»", baked && (await P2.locator(".sg .cell").count()) === 1, await P2.locator("[data-grid]").innerHTML().catch(() => null));
  await P2.close();
  // СТРАНИЦА СПРАЙТА
  await p.locator(".sg .cell").first().click();
  await p.waitForSelector("[data-sprite-page]");
  const name = await p.locator("[data-sprite-page] h2").innerText();
  await p.click('[data-pal16="7"]');
  await p.click('[data-bg="check"]');
  await p.fill("[data-zoom]", "1.6");
  await p.click("[data-flip]");
  const st = await p.locator("[data-stage3d]").boundingBox();
  await p.mouse.move(st.x + 100, st.y + 150);
  await p.mouse.down();
  await p.mouse.move(st.x + 190, st.y + 120, { steps: 4 });
  await p.mouse.up();
  const ry = await p.getAttribute("[data-stage3d]", "data-ry");
  await reload();
  await p.waitForSelector("[data-sprite-page]", { timeout: 5000 }).catch(() => {});
  const same = (await p.locator("[data-sprite-page] h2").innerText().catch(() => "")) === name;
  check("открытый спрайт — после обновления тот же, с тем же поворотом", same && (await p.getAttribute("[data-stage3d]", "data-ry")) === ry, [name, ry, await p.getAttribute("[data-stage3d]", "data-ry").catch(() => null)]);
  check("и с той же расцветкой, фоном, масштабом, отражением", (await p.locator('[data-pal16="7"].on').count()) === 1 && /bg-check/.test(await p.getAttribute("[data-stage3d]", "class")) && (await p.inputValue("[data-zoom]")) === "1.6" && /scaleX\(-1\)/.test(await p.getAttribute("[data-card]", "style")), await p.getAttribute("[data-card]", "style"));
  await p.goBack();
  await p.waitForTimeout(400);
  check("«назад» — галерея с теми же полками", (await p.locator("[data-list]").isVisible()) && (await p.locator('[data-chip="gk"] [data-chip-v="head"]').count()) === 1, null);
  await p.goForward();
  await p.waitForTimeout(400);
  check("«вперёд» — снова спрайт", (await p.locator("[data-sprite-page] h2").innerText().catch(() => "")) === name, null);
  await p.click("[data-back]");
  // ДЕТАЛИ
  await p.click('[data-tab="parts"]');
  await p.click('[data-pane="parts"] [data-slot="head"]');
  await p.click('[data-part="queen:head"]');
  await p.click('[data-set="crusader"]');
  await p.click('[data-pane="parts"] [data-pal="4"]');
  await p.click('[data-scene="table"]');
  await p.locator("[data-cam]", { hasText: "сбоку" }).click();
  await p.fill('[data-f="scale"]', "1.7");
  await reload();
  await p.waitForSelector('[data-pane="parts"]:not([hidden]) [data-stage]', { timeout: 5000 }).catch(() => {});
  check("вкладка «Детали» остаётся открытой", !(await p.locator('[data-pane="parts"]').isHidden()), null);
  check("деталь, на ком, расцветка, сцена — те же", (await p.locator('[data-part="queen:head"].on').count()) === 1 && (await p.locator('[data-set="crusader"].on').count()) === 1 && (await p.locator('[data-pane="parts"] [data-pal="4"].on').count()) === 1 && (await p.locator('[data-scene="table"].on').count()) === 1, null);
  check("камера стола — та же", (await p.getAttribute("[data-stage]", "data-pitch")) === "6", await p.getAttribute("[data-stage]", "data-pitch"));
  check("несохранённая правка — на месте", (await p.inputValue('[data-f="scale"]')) === "1.7" && (await p.isEnabled("[data-save]")), await p.inputValue('[data-f="scale"]'));
  await p.click("[data-reset]");
  // AGY
  await p.click('[data-tab="sprites"]');
  await p.click('[data-sub="agy"]');
  await p.fill('[data-a="brief"]', "черновик пирата");
  await reload();
  check("agy: вкладка и недописанный бриф — на месте", !(await p.locator("[data-agy]").isHidden()) && (await p.inputValue('[data-a="brief"]')) === "черновик пирата", await p.inputValue('[data-a="brief"]').catch(() => null));
  await p.fill('[data-a="brief"]', "");
  check("без ошибок на странице", errors.length === 0, errors);
} finally {
  await browser.close();
}
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${JSON.stringify(c.got).slice(0, 300)}`}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
