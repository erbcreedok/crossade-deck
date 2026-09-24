// ЗАКРЫТЫЙ СТОЛ ПО СТАРОЙ ССЫЛКЕ — человек должен увидеть внятный экран.
//
// Две поломки подряд жили на этом месте. Сперва вход по старой ссылке ЗАВОДИЛ стол заново: человек
// попадал за безымянный стол с чужим именем, где у него ничего нет, и не понимал, куда делся его.
// Потом, когда вход закрыли, на том же месте осталась голая строка ошибки посреди чёрного поля —
// читается как поломка, хотя закрытый стол это обычный конец.
//
// Проверяется живьём, потому что ломается это по дороге: сервер отказывает верно, а увидеть, ЧТО
// показали человеку, можно только глазами.
//   node scripts/tableClosed.mjs [base] [room] - [shot.png]
import { createRequire } from "module";
import { createHmac } from "crypto";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
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
await p.waitForTimeout(6000);
const видно = await p.evaluate(() => {
  const note = document.getElementById("note");
  return { скрыто: note?.hidden, текст: note?.textContent?.trim().slice(0, 160), стол: document.querySelectorAll("[data-section]").length };
});
console.log("экран:", JSON.stringify(видно));
const ок = видно.скрыто === false && /закрыт/i.test(видно.текст ?? "") && видно.стол === 0;
console.log(ок ? "✓ показан экран закрытого стола, а не подменённый стол" : "✗ не то");
await p.screenshot({ path: process.argv[5] });
await b.close();
if (!ок) process.exitCode = 1;
