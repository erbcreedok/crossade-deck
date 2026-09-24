// СТУЛЬЯ ГЛАЗАМИ АДМИНА: добавить, посадить машину выбранным мозгом, убрать пустой.
import { createRequire } from "module";
import { createHmac } from "crypto";
const require = createRequire(process.env.PW_FROM);
const { chromium } = require("playwright");
const [base, room] = process.argv.slice(2);
const initData = (id, name) => {
  const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name }) };
  const check = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update("test").digest();
  return new URLSearchParams({ ...f, hash: createHmac("sha256", key).update(check).digest("hex") }).toString();
};
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("ОШИБКА", e.message));
const хвост = new URLSearchParams({ tgWebAppData: initData(254410503, "Ye"), tgWebAppVersion: "7.0", tgWebAppPlatform: "web", tgWebAppThemeParams: "{}" });
await p.goto(`${base}/table/?room=${room}#${хвост}`);
await p.waitForSelector("[data-section]");
await p.waitForTimeout(2500);
const cdp = await ctx.newCDPSession(p);
const touch = (t, pts) => cdp.send("Input.dispatchTouchEvent", { type: t, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const тап = async (x, y) => { await touch("touchStart", [[x, y]]); await touch("touchEnd", []); await p.waitForTimeout(900); };
/** Ждём появления — разметка пересобирается кадром позже нажатия. */
const дождаться = async (sel, мс = 6000) => {
  try { await p.locator(sel).first().waitFor({ timeout: мс }); return true; } catch { return false; }
};
const места = () => p.evaluate(() => (JSON.parse(document.querySelector("canvas").dataset.spots || "{}").seats ?? []).map((s) => ({ key: s.key, x: Math.round(s.x), y: Math.round(s.y), кто: s.name ?? null })));
const проверки = [];
const чек = (имя, ок, что) => проверки.push({ имя, ок, что });

let было = await места();
console.log("стулья:", JSON.stringify(было));

// 1) ЕЩЁ СТУЛ — из окна крупье: пустых стульев может не быть вовсе.
const крупье = было.find((s) => s.key === "c2") ?? было[0];
await тап(крупье.x, крупье.y);
чек("окно крупье открылось", (await p.locator('[data-croupier-acts]').count()) > 0);
const доб = (await места()).length;
await p.locator('[data-chair-act="add"]').first().click();
await p.waitForTimeout(1000);
const послеДоб = (await места()).length;
чек("стул добавился", послеДоб === доб + 1, { было: доб, стало: послеДоб });

// 2) ПОСАДИТЬ МАШИНУ выбранным мозгом — из окна нового пустого стула.
// Новый — тот, которого не было до нажатия.
const прежние = new Set(было.map((s) => s.key));
await p.waitForTimeout(600);
const новый = (await места()).find((s) => !прежние.has(s.key));
console.log("новый стул:", JSON.stringify(новый));
if (!новый) { console.log("новый стул не нашёлся"); await b.close(); process.exit(1); }
// Закрыть окна: открытая панель крупье перекрывает стул, и тап уходит в неё.
for (const el of await p.locator('[data-shut]').all()) await el.click().catch(() => {});
await p.waitForTimeout(500);
await тап(новый.x, новый.y);
const окноНового = await дождаться(`[data-g="tip"][data-tip="${новый.key}"]`);
чек("окно нового стула открылось", окноНового);
const естьМозги = await дождаться(`[data-mind-acts][data-chair="${новый.key}"] [data-bot="seat"]`);
const мозгов = await p.locator(`[data-mind-acts][data-chair="${новый.key}"] [data-bot="seat"]`).count();
чек("предложены мозги на выбор", естьМозги && мозгов >= 2, мозгов);
if (мозгов) {
  await p.locator(`[data-mind-acts][data-chair="${новый.key}"] [data-bot="seat"][data-brain="claude"]`).first().click();
  await p.waitForTimeout(1400);
}

// 3) УБРАТЬ ПУСТОЙ СТУЛ
const сел = (await места()).find((s) => s.key === новый.key);
чек("на стул сел игрок", Boolean(сел), сел);

// УБРАТЬ ПУСТОЙ СТУЛ — на свежем стуле, без наслоения открытых окон.
for (const el of await p.locator('[data-shut]').all()) await el.click().catch(() => {});
await p.waitForTimeout(500);
const былоСтульев = (await места()).length;
await p.locator('[data-croupier-acts] [data-chair-act="add"]').first().click().catch(async () => {
  const крупье2 = (await места()).find((s) => s.key === "c2");
  await тап(крупье2.x, крупье2.y);
  await p.locator('[data-chair-act="add"]').first().click();
});
await p.waitForTimeout(900);
const прежние2 = new Set((await места()).map((s) => s.key));
const свежий = (await места()).find((s) => !прежние.has(s.key) && s.key !== новый.key);
чек("второй стул добавился", Boolean(свежий), { былоСтульев, стало: (await места()).length });
if (свежий) {
  for (const el of await p.locator('[data-shut]').all()) await el.click().catch(() => {});
  await p.waitForTimeout(500);
  await тап(свежий.x, свежий.y);
  const окно = await дождаться(`[data-g="tip"][data-tip="${свежий.key}"]`);
  const панели = await p.evaluate(() => [...document.querySelectorAll("[data-mind-acts]")].map((e) => e.dataset.chair));
  console.log("окно свежего:", окно, "| панели у стульев:", JSON.stringify(панели), "| свежий:", свежий.key);
  const нутро = await p.evaluate((k) => {
    const el = document.querySelector(`[data-mind-acts][data-chair="${k}"]`);
    return el ? el.innerHTML.replace(/style="[^"]*"/g, "") : "НЕТ";
  }, свежий.key);
  console.log("внутри панели:", нутро.slice(0, 200));
  const состав = await p.evaluate(() => (JSON.parse(document.querySelector("canvas").dataset.spots || "{}").seats ?? []).map((x) => x.key + ":" + (x.name ?? "—")));
  console.log("состав стола:", JSON.stringify(состав));
  const естьКнопка = await дождаться(`[data-mind-acts][data-chair="${свежий.key}"] [data-chair-act="drop"]`, 3000);
  чек("у пустого стула есть «убрать»", естьКнопка);
  if (естьКнопка) {
    const до = (await места()).length;
    await p.locator(`[data-mind-acts][data-chair="${свежий.key}"] [data-chair-act="drop"]`).first().click();
    await p.waitForTimeout(1100);
    чек("пустой стул убрался", (await места()).length === до - 1, { до, после: (await места()).length });
  }
}

await p.screenshot({ path: process.argv[4] ?? "chairs.png" });
await b.close();
for (const c of проверки) console.log(c.ок ? "✓" : "✗", c.имя, c.ок ? "" : JSON.stringify(c.что));
if (проверки.some((c) => !c.ок)) process.exitCode = 1;
