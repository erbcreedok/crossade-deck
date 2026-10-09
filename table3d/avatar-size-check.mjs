// АВАТАР ОДИН И ТОТ ЖЕ С ЛЮБОГО РАКУРСА: толщина чужой руки, шеи и кисти (самый крупный шар и самая толстая палка) не растёт с расстоянием до камеры (исключение — мой личный аватар).
//   node avatar-size-check.mjs [base]
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [], checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const sizes = {};
for (const cam of ["top", "head", "orbit"]) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/?stand&cam=${cam}`);
  await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await p.waitForTimeout(2500);
  sizes[cam] = await p.evaluate(() => window.__t3d.otherBodySize());
  await p.close();
}
const near = (a, b) => a && b && Math.abs(a.ball - b.ball) < 0.02 && Math.abs(a.stick - b.stick) < 0.02;
check("чужой аватар одного размера сверху, от первого лица и в свободной камере", near(sizes.top, sizes.head) && near(sizes.top, sizes.orbit), sizes);
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
