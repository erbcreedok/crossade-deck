// ВИД КОЛОДЫ — ЛИЧНЫЙ. Шестерёнка сверху открывает настройки; «4 цвета» и «Кириллица» меняют лица только у того,
// кто их включил, переживают перезагрузку, а окно закрывается касанием мимо.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableLook.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const browser = await chromium.launch();
const url = (name) => `${base}/table/?room=${room}&name=${name}`;
const ready = async (p) => {
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(500);
};
const open = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.goto(url(name));
  await ready(p);
  return p;
};
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const loaded = (p) => p.evaluate(() => performance.getEntriesByType("resource").map((r) => new URL(r.name).pathname).filter((n) => n.includes("/table/cards/") && !n.includes("/backs/")).map((n) => n.split("/")[3]));
const handArt = (p) => p.evaluate(() => [...document.querySelectorAll("#over [data-g=art]")].map((e) => e.style.backgroundImage).filter((b) => !b.includes("/backs/")));

const A = await open("A");
const B = await open("B");

// Карта в руку, лицом к себе.
const toHand = async (p) => {
  const top = (await spots(p)).deckTop;
  await p.mouse.move(top.x, top.y);
  await p.mouse.down();
  await p.mouse.move(195, 600, { steps: 5 });
  await p.mouse.move(195, 790, { steps: 5 });
  await p.mouse.up();
  await p.waitForTimeout(800);
};
await toHand(A);
check("в руке A лицо обычного набора", (await handArt(A)).some((b) => /\/classic\//.test(b)), await handArt(A));

const mid0 = (await spots(A)).middle;
check("окна настроек нет, пока не нажата шестерёнка", (await A.$("[data-settings-panel]")) === null);
await A.click("[data-settings]");
await A.waitForTimeout(200);
check("шестерёнка открывает окно: звуки, вибрация, 4 цвета, кириллица", (await A.$$("[data-settings-panel] [data-look]")).length === 4);
check("нажатие шестерёнки не двигает стол", JSON.stringify((await spots(A)).middle) === JSON.stringify(mid0), [(await spots(A)).middle, mid0]);

await A.click("[data-look=fourColour]");
await A.waitForTimeout(200);
await A.click("[data-look=cyrillic]");
await A.waitForTimeout(1200);
check("оба тумблера включены", (await A.getAttribute("[data-look=fourColour]", "aria-checked")) === "true" && (await A.getAttribute("[data-look=cyrillic]", "aria-checked")) === "true");
check("A грузит набор classic-4c-cyr", (await loaded(A)).includes("classic-4c-cyr"), [...new Set(await loaded(A))]);
check("в руке A лицо classic-4c-cyr", (await handArt(A)).some((b) => b.includes("/classic-4c-cyr/")), await handArt(A));
check("B своих настроек не трогал — у него только обычный набор", (await loaded(B)).every((s) => s === "classic"), [...new Set(await loaded(B))]);

await A.mouse.click(195, 300);
await A.waitForTimeout(300);
check("касание мимо закрывает окно", (await A.$("[data-settings-panel]")) === null);

await A.reload();
await ready(A);
await toHand(A);
check("после перезагрузки у A снова classic-4c-cyr", (await handArt(A)).some((b) => b.includes("/classic-4c-cyr/")) && !(await loaded(A)).includes("classic"), [...new Set(await loaded(A))]);
await A.click("[data-settings]");
await A.waitForTimeout(200);
check("после перезагрузки тумблеры помнят", (await A.getAttribute("[data-look=cyrillic]", "aria-checked")) === "true");
await A.click("[data-look=fourColour]");
await A.waitForTimeout(1000);
check("выключил 4 цвета — в руке classic-cyr", (await handArt(A)).some((b) => b.includes("/classic-cyr/")), await handArt(A));

for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`${checks.filter((c) => c.ok).length}/${checks.length}`);
await browser.close();
process.exit(checks.every((c) => c.ok) ? 0 : 1);
