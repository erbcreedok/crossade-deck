// НЕСОМАЯ КАРТА СМОТРИТ НА ГЛАЗ НЕСУЩЕГО: в виде «голова» над свободным столом она наклонена к камере (но не целиком — часть наклона остаётся «как ляжет»), низ не под сукном;
// в виде «сверху» наклона нет; чужой экран видит тот же наклон к голове несущего.
//   node tilt-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const errors = [], checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const run = async (cam) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/?stand&cam=${cam}`);
  await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await p.waitForTimeout(1500);
  const id = await p.evaluate(() => { const s = window.__t3d.state(); const c = s.chairs.find((x) => x.owner === "me").hand.at(0); window.__t3d.dropFeltAt(c.id, 0, 0); return c.id; });
  await p.waitForTimeout(900);
  const c = await p.evaluate((i) => window.__t3d.screenOf(i), id);
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 30, c.y - 40, { steps: 6 }); await p.waitForTimeout(500);
  const t = await p.evaluate((i) => ({ drag: window.__t3d.draggingId(), tilt: window.__t3d.cardTilt(i) }), id);
  await p.mouse.up();
  await p.close();
  return t;
};
const head = await run("head"), top = await run("top");
console.log("head", JSON.stringify(head.tilt), "top", JSON.stringify(top.tilt));
check("взята в виде «голова»", head.drag !== null, head);
check("голова: карта наклонена к камере (заметно, но не вся)", head.tilt && head.tilt.fromUp > 8 && head.tilt.fromUp < 85, head.tilt);
check("голова: низ карты выше сукна", head.tilt && head.tilt.minY > 0.05, head.tilt);
check("сверху: наклона нет", top.tilt && top.tilt.fromUp < 3, top.tilt);
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
