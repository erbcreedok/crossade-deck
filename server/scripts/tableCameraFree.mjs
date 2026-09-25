// СВОБОДА КАМЕРЫ — при любом зуме стол прижимается краем к краю экрана, но не теряется совсем.
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2597 npx tsx src/index.ts
//   node scripts/tableCameraFree.mjs [base] [secret] [shot.png]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2597";
const secret = process.argv[3] ?? "probe";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("ERROR", e.message));
await p.goto(`${base}/table/?room=${room}&name=Аня`);
await p.waitForSelector("[data-section]");
await p.waitForSelector(".crossade-loading", { state: "detached" });
await p.waitForTimeout(500);
const cdp = await ctx.newCDPSession(p);
const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
async function gesture(from, to, steps = 14) {
  await touch("touchStart", from);
  for (let i = 1; i <= steps; i += 1) await touch("touchMove", from.map(([x, y], k) => [x + ((to[k][0] - x) * i) / steps, y + ((to[k][1] - y) * i) / steps]));
  await touch("touchEnd", []);
  await p.waitForTimeout(900);
}
const view = async () => (await p.getAttribute("canvas", "data-view")).split(",").map(Number);
/** Есть ли стол (непрозрачный холст) в этой точке экрана. */
const tableAt = (x, y) => p.evaluate(([x, y]) => {
  const c = document.querySelector("canvas");
  const k = c.width / c.getBoundingClientRect().width;
  return c.getContext("2d").getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data[3] > 0;
}, [x, y]);
/** Низ кадра стола — верх панели снизу. */
const floor = await p.evaluate(() => Math.min(...[...document.querySelectorAll("button")].map((b) => b.getBoundingClientRect()).filter((r) => r.top > 600).map((r) => r.top)));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

// Чуть приблизить — щипком до ~1.05.
await gesture([[180, 420], [210, 420]], [[179, 420], [211, 420]], 6);
const z = (await view())[2];
check("зум около 1.05", z > 1.01 && z < 1.2, z);
check("до жеста низ кадра пуст", !(await tableAt(195, floor - 30)), floor);

// Одним пальцем по сукну у верхнего края стола — вниз.
await gesture([[195, 330]], [[195, 700]]);
check("стол прижимается низом к низу экрана", await tableAt(195, floor - 30), await view());

// Со всей силы вниз ещё — стол не теряется: середина стола всё ещё в кадре.
for (let i = 0; i < 3; i += 1) await gesture([[195, 300]], [[195, 760]]);
const far = await view();
check("стол не уехал целиком — он ещё в кадре", await tableAt(195, floor - 4), far);
await p.screenshot({ path: process.argv[4] ?? "camera-free.png" });

await browser.close();
for (const one of checks) console.log(one.ok ? "✓" : "✗", one.name, one.ok ? "" : JSON.stringify(one.got));
console.log(`${checks.filter((one) => one.ok).length}/${checks.length}`);
if (checks.some((one) => !one.ok)) process.exitCode = 1;
