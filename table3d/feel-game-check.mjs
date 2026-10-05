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
  await p.evaluate((h) => { window.__hand = h; window.__marks = []; const log = (globalThis.__feelLog ??= []), o = log.push.bind(log); log.push = (...a) => { window.__marks.push([a[0].kind, performance.now(), window.__t3d.airOf(window.__hand)]); return o(...a); }; }, hand);
  const s1 = await p.evaluate(() => (globalThis.__tableSounds ?? []).length);
  await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(from.x, from.y - 60, { steps: 5 });
  await p.mouse.move(120, 420, { steps: 8 }); await p.waitForTimeout(300);
  const up = await p.evaluate(() => performance.now()), airUp = await p.evaluate((h) => window.__t3d.heightOf(h), hand); await p.mouse.up();
  await p.waitForTimeout(1000);
  const out = await p.evaluate((n) => ({ old: (globalThis.__tableSounds ?? []).slice(n).map((x) => x.kind), feel: (globalThis.__feelLog ?? []).map((x) => x.kind), at: (window.__marks.find(([k]) => k === "lay" || k === "throw") ?? [])[1] ?? null, air: (window.__marks.find(([k]) => k === "lay" || k === "throw") ?? [])[2] ?? null }), s1);
  out.after = out.at === null ? null : Math.round(out.at - up); out.airUp = airUp;
  await p.close();
  return out;
}
/** Тики поворота: только от жеста поворота (Ctrl + мышь), а не оттого, что несомая карта развернулась вслед за камерой, пока её ведут по экрану. Слышат и мой экран, и чужой (экран Алии). */
async function spinPhase() {
  writeFileSync(file, JSON.stringify({ spin: {} }) + "\n");
  await new Promise((r) => setTimeout(r, 1200));
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/?stand&cam=head`);
  await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"));
  await p.waitForTimeout(1500);
  const hand = await p.evaluate(() => window.__t3d.state().chairs.find((x) => x.owner === window.__t3d.me()).hand.at(-1).id);
  const from = await p.evaluate((i) => window.__t3d.screenOf(i), hand);
  const spins = () => p.evaluate(() => (globalThis.__feelLog ?? []).filter((x) => x.kind === "spin").length);
  // сначала карту из руки кладут на сукно, потом берут уже её: чужой экран видит несомые карты со стола
  await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(from.x, from.y - 60, { steps: 5 }); await p.mouse.move(190, 420, { steps: 8 }); await p.mouse.up();
  await p.waitForFunction(() => window.__t3d.state().felt.length > 0, null, { timeout: 5000 }); await p.waitForTimeout(2500);
  const lying = await p.evaluate(() => window.__t3d.state().felt[0].id), at = await p.evaluate((i) => window.__t3d.screenOf(i), lying);
  await p.evaluate(() => { globalThis.__feelLog.length = 0; });
  await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x, at.y - 30, { steps: 5 });
  for (const x of [330, 60, 330, 60]) { await p.mouse.move(x, 300, { steps: 12 }); await p.waitForTimeout(200); }
  await p.waitForTimeout(2500);
  const walked = await spins();
  await p.keyboard.down("Control");
  for (let k = 1; k <= 12; k++) { await p.mouse.move(190 + k * 15, 300); await p.waitForTimeout(40); }
  await p.keyboard.up("Control");
  await p.waitForTimeout(2500);
  const turned = await spins();
  await p.mouse.up();
  // Чужой несёт карту: угол карты в потоке меняется вслед за его камерой (тиков нет); тики — только когда в потоке растёт поворот жестом `spin`.
  await p.waitForTimeout(1500);
  const fake = (angle, spin) => p.evaluate(([id, angle, spin]) => window.__t3d.hearFake([{ id, by: "stranger", over: { in: "felt", x: 0, y: 0, angle, up: true }, from: { in: "felt", x: 0, y: 0, up: true }, card: { id }, ...(spin ? { spin } : {}) }]), [lying, angle, spin]);
  await p.evaluate(() => { globalThis.__feelLog.length = 0; });
  await fake(0); for (const angle of [20, 45, 90, 140, 200]) await fake(angle);
  const others = await spins();
  await fake(200, 20); await fake(200, 40);
  const others2 = await spins();
  await p.close();
  return { walked, turned, others, others2 };
}
try {
  const none = await phase("{}\n");
  check("файл заводских пуст: игра звучит по-старому (стук drop/out), новые не играют", none.old.some((k) => k === "out" || k === "drop") && !none.feel.includes("lay"), none);
  const lay = await phase(JSON.stringify({ lay: { track: "drop-2" }, throw: { track: "drop-2" } }) + "\n");
  // На стенде два экрана (мой и Алии), оба слышат; новое действие озвучивает мой, поэтому прежних стуков у «Положил» в игре на один меньше.
  const knock = (o) => o.old.filter((k) => k === "out" || k === "drop").length;
  check("«Положил» и «Бросил» записаны в игру: играет действие (lay или throw), и прежний стук моего экрана молчит (стуков меньше, чем без записи)", lay.feel.some((k) => k === "lay" || k === "throw") && knock(lay) < knock(none), { none, lay });
  check("звук «Положил» — когда карта упала на стол, а не в миг, когда палец отпустил (в момент отпускания карта высоко над столом, в момент звука — уже на нём)", lay.air !== null && lay.airUp > 0.3 && lay.air < 0.12, lay);
  const other = await phase(JSON.stringify({ flip: { track: "turn-1" } }) + "\n");
  check("в игре только «Перевернул»: положить карту звучит по-старому (столько же стуков, сколько без записи)", knock(other) === knock(none) && !other.feel.includes("lay"), { none, other });
  const sp = await spinPhase();
  check("несу карту по экрану от первого лица (она разворачивается за камерой) — тиков поворота нет ни у меня, ни у чужого экрана", sp.walked === 0, sp);
  check("поворот жестом (Ctrl + мышь) даёт тики", sp.turned > sp.walked, sp);
  check("чужая карта разворачивается вслед за его камерой (угол в потоке меняется, жеста нет) — тиков нет", sp.others === 0, sp);
  check("чужой поворот жестом (в потоке растёт `spin`) — тики есть", sp.others2 - sp.others >= 2, sp);
} finally { writeFileSync(file, was); await browser.close(); }
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
