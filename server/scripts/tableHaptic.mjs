// ВИБРАЦИЯ — только своё: мои действия, карта в мою руку, кнопки и клавиши. Выключается в настройках.
// В безголовом браузере Telegram нет — его `HapticFeedback` подменён журналом `window.__tg`.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableHaptic.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const browser = await chromium.launch();
// Настоящий `HapticFeedback` вне Telegram молчит — его методы подменяются журналом.
const stubTelegram = (p) => p.evaluate(() => {
  window.__tg = [];
  window.__platform = "ios";
  const push = (x) => window.__tg.push(x);
  const HapticFeedback = { impactOccurred: push, notificationOccurred: push, selectionChanged: () => push("selection") };
  // Поля настоящего `WebApp` только для чтения — стол видит обёртку поверх него.
  const real = window.Telegram.WebApp;
  window.Telegram.WebApp = new Proxy({}, { get: (_, k) => (k === "platform" ? window.__platform : k === "version" ? "8.0" : k === "isVersionAtLeast" ? () => true : k === "HapticFeedback" ? HapticFeedback : real[k]) });
});
const open = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(500);
  await stubTelegram(p);
  return p;
};
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const felt = (p) => p.evaluate(() => window.__tg.splice(0));
const drag = async (p, from, to) => {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await p.mouse.move(to.x, to.y, { steps: 4 });
  await p.mouse.up();
};

const A = await open("A");
const B = await open("B");
await A.waitForTimeout(600);
await felt(A);
await felt(B);
const { k, middle } = await spots(A);

// 1. A кладёт карту с колоды на стол: взял — light, положил — soft. У B — ничего.
await drag(A, (await spots(A)).deckTop, { x: middle.x - 3 * k, y: middle.y - 1.5 * k });
await A.waitForTimeout(900);
let a = await felt(A), b = await felt(B);
check("A: взял — light, положил — soft", a[0] === "light" && a.includes("soft"), a);
check("B: чужой дроп на столе не вибрирует", b.length === 0, b);

// 2. Переворот — rigid.
const f = (await spots(A)).felt[0];
await A.mouse.click(f.x, f.y);
await A.waitForTimeout(60);
await A.mouse.click(f.x, f.y);
await A.waitForTimeout(1200);
a = await felt(A);
b = await felt(B);
check("A: переворот — rigid", a.includes("rigid"), a);
check("B: чужой переворот — тишина", b.length === 0, b);

// 3. A кладёт карту в руку B: у B — light (пришло в мою руку), хоть он ничего не трогал.
await B.waitForTimeout(800);
await felt(B);
const bSeat = (await spots(A)).seats.find((s) => s.who === "B");
await A.mouse.move(middle.x, middle.y);
await A.mouse.down();
await A.mouse.move(bSeat.x + 4, bSeat.y + bSeat.chair * 0.6, { steps: 10 });
await A.waitForTimeout(300);
await A.mouse.up();
await A.waitForTimeout(1000);
b = await felt(B);
check("B: карта пришла в мою руку — light", b.includes("light"), b);

// 4. Кнопка HUD — selection.
await felt(A);
await A.click('[data-section="lasso"]');
await A.waitForTimeout(300);
a = await felt(A);
check("A: кнопка в HUD — selection", a.includes("selection"), a);
await A.click('[data-section="lasso"]');
await A.waitForTimeout(300);

// 5. Выключено в настройках — ни одного вызова; помнится.
await A.click("[data-settings]");
await A.waitForTimeout(200);
check("тумблер «Вибрация» есть, по умолчанию включён", (await A.getAttribute("[data-look=haptic]", "aria-checked")) === "true");
await A.click("[data-look=haptic]");
await A.mouse.click(195, 300);
await A.waitForTimeout(300);
await felt(A);
await drag(A, (await spots(A)).deckTop, { x: middle.x + 3 * k, y: middle.y - 1.5 * k });
await A.waitForTimeout(900);
await A.click('[data-section="lasso"]');
await A.waitForTimeout(300);
a = await felt(A);
check("выключил — ни дропа, ни кнопок", a.length === 0, a);
await A.reload();
await A.waitForSelector("[data-settings]");
await stubTelegram(A);
await A.click("[data-settings]");
check("выключенная вибрация помнится после перезагрузки", (await A.getAttribute("[data-look=haptic]", "aria-checked")) === "false");
await B.click("[data-settings]");
check("у B своя — включена", (await B.getAttribute("[data-look=haptic]", "aria-checked")) === "true");
await B.mouse.click(195, 300);

// 5б. Где вибрации нет (Mac, Desktop, браузер) — тумблера нет, и вызовов нет.
await B.evaluate(() => { window.__platform = "macos"; });
if (await B.$("[data-settings-panel]")) await B.click("[data-settings]");
await B.waitForTimeout(200);
await B.click("[data-settings]");
await B.waitForTimeout(200);
check("на Mac тумблера вибрации нет, внизу — клиент", (await B.$("[data-look=haptic]")) === null && /macos/.test(await B.textContent("[data-client]")), null);
await B.mouse.click(195, 300);
await B.waitForTimeout(300);
await felt(B);
await B.click('[data-section="lasso"]');
await B.click('[data-section="lasso"]');
b = await felt(B);
check("на Mac кнопки не зовут вибрацию", b.length === 0, b);
await B.evaluate(() => { window.__platform = "ios"; });

// 5в. Кнопка «Проверить вибрацию» — три отклика и строка о канале.
await B.click("[data-settings]");
await B.waitForTimeout(200);
await felt(B);
await B.click("[data-haptic-probe]");
await B.waitForTimeout(1000);
b = await felt(B);
check("проверка: heavy, success, selection и «отправлено»", ["heavy", "success", "selection"].every((x) => b.includes(x)) && /отправлено/.test(await B.textContent("[data-client]")), [b, await B.textContent("[data-client]")]);
await B.mouse.click(195, 300);
await B.waitForTimeout(300);

// 6. Шафл у B — серия лёгких тиков.
await B.waitForTimeout(500);
const grip = await B.locator('[data-g="deck-grip"][data-pile="deck"]').boundingBox();
await B.mouse.click(grip.x + grip.width / 2, grip.y + grip.height / 2);
await B.waitForTimeout(450);
await felt(B);
await B.locator('[data-deck-do="shuffle"]').dispatchEvent("pointerdown");
await B.waitForTimeout(1800);
b = await felt(B);
check("B: шафл — серия light (≥8)", b.filter((x) => x === "light").length >= 8, b);

// 7. Клавиатура и стикер без слотов.
{
  await B.click('[data-section="say"]');
  await B.waitForTimeout(400);
  await felt(B);
  await B.locator('[data-key="А"],[data-key="A"]').first().dispatchEvent("pointerdown");
  await B.waitForTimeout(100);
  b = await felt(B);
  check("B: клавиша — selection", b.includes("selection"), b);
}

for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableHaptic ${checks.filter((c) => c.ok).length}/${checks.length}`);
await browser.close();
process.exit(checks.every((c) => c.ok) ? 0 : 1);
