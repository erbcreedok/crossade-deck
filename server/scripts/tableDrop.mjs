// ДРОП НА СУКНО ПРИ ПОВЁРНУТОЙ КАМЕРЕ — касаниями: контур не отстаёт от пальца, стоит так, как ляжет
// карта, и карта ложится ровно к экрану того, кто её бросил.
//   node scripts/tableDrop.mjs [base]
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2590";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("ERROR", e.message));
await page.goto(`${base}/table/?stand`);
await page.waitForSelector("[data-section]");
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const view = async () => (await page.getAttribute("canvas", "data-view")).split(",").map(Number);
const scene = async () => JSON.parse(await page.getAttribute("canvas", "data-spots"));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

// Повернуть стол двумя пальцами на ~40° (порог поворота — 12°).
{
  const c = { x: 195, y: 470 };
  const R = 70;
  const at = (deg) => [c.x + R * Math.cos((deg * Math.PI) / 180), c.y + R * Math.sin((deg * Math.PI) / 180)];
  const from = [at(180), at(0)];
  await touch("touchStart", from);
  for (let d = 0; d <= 52; d += 4) await touch("touchMove", [at(180 + d), at(d)]);
  await touch("touchEnd", []);
  await page.waitForTimeout(800);
}
const rotation = (await view())[3];
check("стол повёрнут", Math.abs(rotation) > 20, rotation);

// Карта из руки — на сукно, медленно, со сверкой контура на каждом шаге.
//
// КУДА — в середину стола, а не в пиксели наугад: стол меняет размер, стулья пересаживаются, и точка,
// бывшая когда-то сукном, оказывается зоной чужой руки — там горит её гнездо, а не контур на сукне.
const card = await page.locator("[data-card]").first().boundingBox();
const start = [card.x + card.width / 2, card.y + card.height / 2];
const mid = (await scene()).middle;
const end = [mid.x, mid.y];
await touch("touchStart", [start]);
let worst = 0;
let markAngle = null;
let onFelt = 0;
for (let i = 1; i <= 20; i += 1) {
  const p = [start[0] + ((end[0] - start[0]) * i) / 20, start[1] + ((end[1] - start[1]) * i) / 20];
  await touch("touchMove", [p]);
  // СВЕРЯЕМ ТОЛЬКО ТАМ, ГДЕ ЭКРАН САМ ЦЕЛИТСЯ В СУКНО: над рукой, стулом или стопкой горит их зона.
  const aim = (await scene()).aim;
  if (aim?.kind !== "felt") continue;
  const m = await page.evaluate(() => {
    const mark = document.querySelector("[data-felt-mark]");
    const carry = document.querySelector('[data-g="carry"]');
    if (!mark || !carry) return null;
    const a = mark.querySelector("polygon").getBoundingClientRect();
    const c = carry.getBoundingClientRect();
    // Контур — настоящие углы карты на сукне: верхняя кромка — от первого угла ко второму.
    const [p0, p1] = mark.querySelector("polygon").getAttribute("points").split(" ").map((one) => one.split(",").map(Number));
    return { mx: a.left + a.width / 2, cx: c.left + c.width / 2, t: (Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI };
  });
  if (m) {
    onFelt += 1;
    worst = Math.max(worst, Math.abs(m.mx - m.cx));
    markAngle = m.t;
  }
}
check("палец прошёл над сукном — было что сверять", onFelt >= 3, onFelt);
check("контур на сукне идёт за пальцем без отставания (по x ≤ 1.5px)", worst <= 1.5, worst);
check("контур стоит ровно к экрану (поворот стола + карты = 0)", markAngle !== null && Math.abs(markAngle) < 0.5, markAngle);
await touch("touchEnd", []);
await page.waitForTimeout(600);

const felt = (await scene()).felt;
const laid = felt.at(-1);
check("карта легла на сукно", Boolean(laid), felt);
check("угол карты — против поворота камеры", laid && Math.abs(((laid.angle + rotation + 540) % 360) - 180) < 0.5, { laid, rotation });

await page.screenshot({ path: process.argv[3] ?? "drop.png" });
await browser.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
if (checks.some((c) => !c.ok)) process.exitCode = 1;
