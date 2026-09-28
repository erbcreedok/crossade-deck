// В AR ГОЛОВА — ТЕЛЕФОН: A держит стол в приложении и обходит его с телефоном, B смотрит обычным экраном.
// У B голова A едет туда, где стоит телефон A, а не остаётся там, где A оставил пальцевую камеру.
//   TABLE_SECRET=probe TABLE_GUESTS=1 PORT=2597 npx tsx src/index.ts
//   node scripts/tableArHead.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2597";
const secret = process.argv[3] ?? "probe";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const browser = await chromium.launch();
const open = async (name, native) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  if (native) await p.addInitScript(() => { window.__crossadeNative = { version: 1, ar() {} }; });
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForTimeout(500);
  return p;
};
const A = await open("A", true);
const B = await open("B", false);
const down = (deg) => [Math.sin((-deg * Math.PI) / 360), 0, 0, Math.cos((deg * Math.PI) / 360)];
const frame = (pos) => A.evaluate(([q, x]) => window.__arFrame(q[0], q[1], q[2], q[3], x[0], x[1], x[2], 62, 1), [down(50), pos]);
const yawOfA = () => B.evaluate(() => { const y = document.querySelector('[data-g="body"][data-name="A"]')?.dataset.yaw; return y === undefined ? null : Number(y); });

await A.locator("[data-ar-enter]").click();
await frame([0, 0, 0]);
await A.waitForTimeout(1500);
const yaws = [];
for (const pos of [[0, 0, 0], [0.6, 0, -0.5], [0, 0, -1.1], [-0.6, 0, -0.5]]) {
  for (let i = 0; i < 6; i += 1) { await frame(pos); await A.waitForTimeout(60); }
  await B.waitForTimeout(500);
  yaws.push(await yawOfA());
}
const apart = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
check("у B есть тело A с поворотом", yaws.every((y) => typeof y === "number"), yaws);
check("A обошёл стол с телефоном — у B голова A повернулась вслед (на другой стороне — почти наоборот)", apart(yaws[0], yaws[2]) > 120 && apart(yaws[1], yaws[3]) > 120, yaws);
check("шаг вбок — голова уходит вбок, а не стоит на месте", apart(yaws[0], yaws[1]) > 30 && apart(yaws[0], yaws[3]) > 30, yaws);

await browser.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableArHead ${checks.filter((c) => c.ok).length}/${checks.length}`);
process.exit(checks.some((c) => !c.ok) ? 1 : 0);
