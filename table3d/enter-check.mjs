// ВХОД В 3D ИЗ БОТА — кнопка «В 3D» открывает мини-апп с `startapp=3d_<комната>`: обычная страница видит приставку и уходит на 3D-вид,
// унося подпись Telegram (`#`). Без приставки остаётся на месте.
//   node enter-check.mjs [стол: http://localhost:2591]     (стол должен быть запущен с этой сборкой)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:2591";
const browser = await chromium.launch();
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const hash = (param) => `#tgWebAppData=${encodeURIComponent(`start_param=${param}&auth_date=1`)}`;
for (const [param, want] of [["3d_roomABC", "/table/3d"], ["roomABC", "/table/"]]) {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on("pageerror", () => {});
  await p.goto(`${base}/table/${hash(param)}`);
  await p.waitForTimeout(2500);
  const u = new URL(p.url());
  check(`startapp=${param} → ${want}, подпись в # на месте`, u.pathname === want && u.hash.includes(encodeURIComponent(param)), p.url());
  await p.close();
}
await browser.close();
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
