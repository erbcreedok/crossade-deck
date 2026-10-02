// ЗВУКИ И ВИБРАЦИИ В 3D — как у обычного стола: карту положили — стук по месту (слева-справа по экрану), своё действие вибрирует, нажатие кнопки худа и «взял карту» — лёгкий тик.
//   node audio-check.mjs [base]     (стенд: `npm run dev`, порт 9590)
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
// Вибрации записываются, только если устройство их умеет: подставляем клиент Telegram с тактильным откликом.
await p.addInitScript(() => { window.Telegram = { WebApp: { platform: "ios", version: "8.0", isVersionAtLeast: () => true, HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} }, ready() {}, expand() {}, onEvent() {} } }; });
await p.goto(`${base}/?stand&cam=head`);
await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
await p.waitForTimeout(1200);
const sounds = () => p.evaluate(() => [...(globalThis.__tableSounds ?? [])]);
const buzz = () => p.evaluate(() => [...(globalThis.__tableHaptics ?? [])]);
const s0 = (await sounds()).length, b0 = (await buzz()).length;
// Нажатие кнопки худа — тик.
await p.locator("[data-section=pose]:visible").first().click();
await p.waitForTimeout(200);
check("нажатие кнопки худа вибрирует (light)", (await buzz()).length > b0 && (await buzz()).slice(b0).includes("light"), (await buzz()).slice(b0));
// Карту из руки — на сукно: взял (тик) и положил (стук по месту, вибрация).
const hand = await p.evaluate(() => { const s = window.__t3d.state(); const c = s.chairs.find((x) => x.owner === window.__t3d.me()); return c.hand.at(-1).id; });
const from = await p.evaluate((i) => window.__t3d.screenOf(i), hand);
const s1 = (await sounds()).length, b1 = (await buzz()).length;
await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(from.x, from.y - 60, { steps: 5 });
check("взял карту — вибрация (light)", (await buzz()).slice(b1).includes("light"), (await buzz()).slice(b1));
await p.mouse.move(120, 420, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(900);
const heard = (await sounds()).slice(s1);
check("положил карту из руки на стол — прозвучал стук (out/drop)", heard.some((x) => x.kind === "out" || x.kind === "drop"), heard);
check("звук поставлен по месту на экране (панорама в пределах −1…1)", heard.length > 0 && heard.every((x) => Math.abs(x.x) <= 1 && Math.abs(x.z) <= 1), heard);
check("и своя вибрация на положил (soft)", (await buzz()).slice(b1).some((k) => k === "soft"), (await buzz()).slice(b1));
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
