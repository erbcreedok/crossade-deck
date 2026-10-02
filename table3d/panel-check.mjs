// ОКНО НА СТОЛЕ РАСТЁТ ВПРАВО И ВНИЗ: масштаб (язычок) не раздвигает его во все стороны — левый верхний угол стоит на месте.
//   node panel-check.mjs [base]     (стенд: `npm run dev`, порт 9590)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
async function rectAt(scale, tilt) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.addInitScript(([scale, tilt]) => { localStorage.setItem("table3d.panelConf", JSON.stringify({ chair: { anchor: "table", tilt } })); localStorage.setItem("table3d.panelAt", JSON.stringify({ "chair:c2": { world: { x: -1.5, y: -1 }, scale: { table: scale } } })); }, [scale, tilt]);
  await p.goto(`${base}/?stand&cam=head`);
  await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await p.waitForTimeout(1200);
  const head = await p.evaluate(() => window.__t3d.bodies().find((b) => b.chair === "c2")?.head);
  await p.mouse.click(head.x, head.y);
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => { const e = document.querySelector("[data-panel]"); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; });
  await p.close();
  return r;
}
for (const tilt of ["camera", "flat"]) {
  const small = await rectAt(0.5, tilt), big = await rectAt(1.4, tilt);
  check(`${tilt}: окно на столе открылось`, !!small && !!big, { small, big });
  if (small && big) {
    // У лежащего окна нижний край ближе к глазу и шире, поэтому габарит чуть уходит влево (перспектива): верх и угол на месте.
    const tol = tilt === "flat" ? 30 : 8;
    check(`${tilt}: левый верх на месте при росте (±${tol} px)`, Math.abs(small.l - big.l) <= tol && Math.abs(small.t - big.t) <= 8, { small, big });
    check(`${tilt}: растёт вправо и вниз`, big.r > small.r + 30 && big.b > small.b + 30, { small, big });
  }
}
await browser.close();
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
