// ЗВУКИ ДЕЙСТВИЙ В ИГРЕ: то, что владелец записал в `feelPreset.json` («В игру» на странице звуков), играет само, а прежний звук того же движения молчит; чего в файле нет — звучит по-старому.
//   node feel-game-check.mjs [base]     (стенд: `npm run dev`, порт 9590; файл заводских на время проверки подменяется и возвращается)
import { createRequire } from "module";
import { readFileSync, writeFileSync } from "fs";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:9590";
const file = new URL("../server/table-client/feelPreset.json", import.meta.url), was = readFileSync(file, "utf8");
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const errors = [], checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
async function phase(preset) {
  writeFileSync(file, preset);
  await new Promise((r) => setTimeout(r, 1200)); // dev-сервер заметит новый файл
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.addInitScript(() => { window.Telegram = { WebApp: { platform: "ios", version: "8.0", isVersionAtLeast: () => true, HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} }, ready() {}, expand() {}, onEvent() {} } }; });
  await p.goto(`${base}/?stand&cam=head`);
  await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await p.waitForTimeout(1500);
  const hand = await p.evaluate(() => { const s = window.__t3d.state(); return s.chairs.find((x) => x.owner === window.__t3d.me()).hand.at(-1).id; });
  const from = await p.evaluate((i) => window.__t3d.screenOf(i), hand);
  const s1 = await p.evaluate(() => (globalThis.__tableSounds ?? []).length);
  await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(from.x, from.y - 60, { steps: 5 });
  await p.mouse.move(120, 420, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(1000);
  const out = await p.evaluate((n) => ({ old: (globalThis.__tableSounds ?? []).slice(n).map((x) => x.kind), feel: (globalThis.__feelLog ?? []).map((x) => x.kind) }), s1);
  await p.close();
  return out;
}
try {
  const none = await phase("{}\n");
  check("файл заводских пуст: игра звучит по-старому (стук drop/out), новые не играют", none.old.some((k) => k === "out" || k === "drop") && !none.feel.includes("lay"), none);
  const lay = await phase(JSON.stringify({ lay: { track: "drop-2" }, throw: { track: "drop-2" } }) + "\n");
  // На стенде два экрана (мой и Алии), оба слышат; новое действие озвучивает мой, поэтому прежних стуков у «Положил» в игре на один меньше.
  const knock = (o) => o.old.filter((k) => k === "out" || k === "drop").length;
  check("«Положил» и «Бросил» записаны в игру: играет действие (lay или throw), и прежний стук моего экрана молчит (стуков меньше, чем без записи)", lay.feel.some((k) => k === "lay" || k === "throw") && knock(lay) < knock(none), { none, lay });
  const other = await phase(JSON.stringify({ flip: { track: "turn-1" } }) + "\n");
  check("в игре только «Перевернул»: положить карту звучит по-старому (столько же стуков, сколько без записи)", knock(other) === knock(none) && !other.feel.includes("lay"), { none, other });
} finally { writeFileSync(file, was); await browser.close(); }
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
