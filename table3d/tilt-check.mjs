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
  await p.evaluate(() => window.__t3d.setCamLocked?.(false));
  const id = await p.evaluate(() => { const s = window.__t3d.state(); const c = s.chairs.find((x) => x.owner === "me").hand.at(0); window.__t3d.dropFeltAt(c.id, 0, 0); return c.id; });
  await p.waitForTimeout(900);
  const up = () => p.evaluate((i) => window.__t3d.cardTopOnScreen(i), id);
  const out = { ups: [] };
  // Камеру крутят (`lookBy`) — и карта в руке, и положенная после броска стоят низом вниз экрана.
  for (const turn of [0, 25, -50]) {
    if (turn) { await p.evaluate((d) => window.__t3d.lookBy(d, 0), turn); await p.waitForTimeout(400); }
    await p.evaluate(([i]) => { const at = window.__t3d.feltAt(195, 520); window.__t3d.dropFeltAt(i, at.x, at.y); }, [id]); await p.waitForTimeout(900);
    const c = await p.evaluate((i) => window.__t3d.screenOf(i), id);
    await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 20, c.y - 30, { steps: 6 }); await p.waitForTimeout(900);
    const t = { turn, drag: await p.evaluate(() => window.__t3d.draggingId()), up: await up(), tilt: await p.evaluate((i) => window.__t3d.cardTilt(i), id) };
    out.ups.push(t); if (turn === 0) out.tilt = t.tilt, out.drag = t.drag;
    await p.mouse.up(); await p.waitForTimeout(1200);
    out.ups.push({ turn, dropped: await up() });
  }
  await p.close();
  return out;
};
// От первого лица карта стоит к глазу одинаково слева, справа и по центру: наклон только вперёд-назад (без крена), и в зеркальных местах — равный.
const side = async (px) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/?stand&cam=head`);
  await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__t3d.setCamLocked?.(false));
  const id = await p.evaluate(([x]) => { const s = window.__t3d.state(); const c = s.chairs.find((q) => q.owner === "me").hand.at(0); const at = window.__t3d.feltAt(x, 540); window.__t3d.dropFeltAt(c.id, at.x, at.y); return c.id; }, [px]);
  let c = await p.evaluate((i) => window.__t3d.screenOf(i), id);
  for (let k = 0; k < 40; k++) { await p.waitForTimeout(150); const n = await p.evaluate((i) => window.__t3d.screenOf(i), id); const still = Math.hypot(n.x - c.x, n.y - c.y) < 0.3; c = n; if (still) break; }
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 3, c.y - 25, { steps: 6 }); await p.waitForTimeout(900);
  const t = await p.evaluate((i) => window.__t3d.cardTilt(i), id);
  await p.mouse.up(); await p.close();
  return t;
};
const L = await side(40), M = await side(195), Rr = await side(350);
console.log("лево", JSON.stringify(L), "центр", JSON.stringify(M), "право", JSON.stringify(Rr));
const head = await run("head"), top = await run("top");
console.log(JSON.stringify(head.ups), JSON.stringify(top.ups));
check("взята в виде «голова»", head.drag !== null, head);
check("голова: карта наклонена к камере (заметно, но не вся)", head.tilt && head.tilt.fromUp > 8 && head.tilt.fromUp < 85, head.tilt);
check("голова: низ карты выше сукна", head.tilt && head.tilt.minY > 0.05, head.tilt);
check("сверху: наклона нет", top.tilt && top.tilt.fromUp < 3, top.tilt);
const upright = (u) => u && u.dy < 0 && Math.abs(u.dx) < Math.abs(u.dy) * 0.4;
for (const [name, r] of [["голова", head], ["сверху", top]]) {
  for (const t of r.ups) { const u = t.up ?? t.dropped; check(`${name}: поворот камеры ${t.turn}° — ${t.dropped ? "после броска" : "в руке"} низ карты к низу экрана`, upright(u), t); }
}
check("слева, по центру и справа: крена нет (наклон только к глазу)", [L, M, Rr].every((t) => t && t.roll < 3), { L, M, Rr });
check("слева и справа наклон равный (зеркально)", Math.abs(L.fromUp - Rr.fromUp) < 3, { L, Rr });
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const k of checks) console.log(k.ok ? "ok  " : "FAIL", k.name, k.ok ? "" : JSON.stringify(k.got));
process.exit(checks.every((k) => k.ok) ? 0 : 1);
