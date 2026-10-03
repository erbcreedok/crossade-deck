// РЕПЛЕЙ ВО ВРЕМЯ ИГРЫ (стенд): кнопка «Реплей» отматывает стол назад; в просмотре жесты за столом молчат, сесть и встать нельзя, ленту можно тянуть и играть
// в обе стороны; «К живому» возвращает стол и камеру.
//   node replay-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/?stand&cam=head`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(1200);
const mineHand = () => p.evaluate(() => { const s = window.__t3d.state(); const seat = s.people.find((x) => x.key === window.__t3d.me()).seat; return s.chairs.find((c) => c.id === seat).hand.length; });
const before = await mineHand();
await p.waitForTimeout(1500);
await p.evaluate(() => window.__t3d.fillHand(3)); await p.waitForTimeout(1500);
await p.evaluate(() => window.__t3d.fillHand(2)); await p.waitForTimeout(1200);
const live = await mineHand();
const feltLive = () => p.evaluate(() => window.__t3d.state().felt.length);
const bottom = await p.evaluate(() => window.__t3d.state().piles[0].cards[0].id);
const felt0 = await feltLive();
check("до реплея: рука выросла после раздачи в руку", live === before + 5, { before, live });
check("кнопка «Реплей» есть на рейке", (await p.$("[data-replay]")) !== null);
await p.click("[data-replay]"); await p.waitForTimeout(600);
check("вошли в просмотр: худ в режиме реплея, вид сверху", await p.evaluate(() => document.querySelector("#hud").classList.contains("replaying") && document.querySelector(".screen:not(.off) [data-view] .lb")?.textContent === "Сверху"), await p.evaluate(() => document.querySelector("#hud").className));
const here = (sel) => p.$(`.screen:not(.off) ${sel}`);
check("в просмотре нет «Пересесть» и «Стоя/Сидя», нижних вкладок", (await here("[data-reseat]")) === null && (await here("[data-stance-toggle]")) === null && (await here(".c-dock")) === null, { reseat: !!(await here("[data-reseat]")), stance: !!(await here("[data-stance-toggle]")), dock: !!(await here(".c-dock")) });
check("лента показывает плитки событий", (await p.$$(".rp-tile.moment")).length >= 3, (await p.$$(".rp-tile")).length);
// Назад по событиям — до самого раннего: рука такая, какой была до раздач.
for (let i = 0; i < 8; i++) await p.click("[data-rp-jump='-1']");
await p.waitForTimeout(500);
const past = await mineHand();
check("отмотали назад — стол из прошлого: в руке было меньше", past < live, { past, live });
// Жесты за столом молчат: карту, которая в живой колоде лежит и сейчас, нельзя бросить на сукно из просмотра.
await p.evaluate((id) => window.__t3d.dropFeltAt(id, 0, 0), bottom); await p.waitForTimeout(500);
// Играть вперёд: время идёт к живому, лента едет; назад — обратно.
const badge = () => p.textContent("[data-rp-badge]");
await p.click("[data-rp-speed]");
check("скорость переключается", (await p.textContent("[data-rp-speed]")) === "2×", await p.textContent("[data-rp-speed]"));
const t0 = await badge();
await p.click("[data-rp-play='1']"); await p.waitForTimeout(1800);
const t1 = await badge();
check("играем вперёд на 2× — «минус» уменьшается", t0 !== t1, { t0, t1 });
await p.click("[data-rp-play='-1']"); await p.waitForTimeout(700);
check("кнопка «назад» подсвечена, идёт назад", await p.evaluate(() => document.querySelector("[data-rp-play='-1']").classList.contains("on")));
await p.click("[data-rp-mode='time']"); await p.waitForTimeout(400);
check("режим «Время» включился и лента на месте", (await p.$$(".rp-tile")).length >= 2 && (await p.evaluate(() => document.querySelector("[data-rp-mode='time']").classList.contains("on"))));
// К живому: стол и камера как были.
await p.click("[data-rp-live]"); await p.waitForTimeout(700);
check("«К живому» — рука снова полная", (await mineHand()) === live, await mineHand());
check("и намерение из просмотра за стол не ушло: на сукне то же", (await feltLive()) === felt0, { felt0, now: await feltLive() });
check("«К живому» — худ без реплея, камера как была (голова)", await p.evaluate(() => !document.querySelector("#hud").classList.contains("replaying")) && (await p.evaluate(() => document.querySelector(".screen:not(.off) [data-view] .lb")?.textContent)) === "Голова");
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
