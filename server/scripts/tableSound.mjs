// ЗВУК СТОЛА ПО МЕСТУ. Слышно всё и всем: своё громче, чужое тише; левее середины экрана — слева, ниже — сзади.
// Играющий звук в безголовом браузере не услышать — проверяется журнал плеера `window.__tableSounds`.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableSound.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const browser = await chromium.launch();
const open = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(500);
  return p;
};
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const heard = (p) => p.evaluate(() => window.__tableSounds.splice(0));
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
await heard(A);
await heard(B);
const { k, middle } = await spots(A);

// 1. A кладёт карту с колоды левее середины.
await drag(A, (await spots(A)).deckTop, { x: middle.x - 3 * k, y: middle.y - 1.5 * k });
await A.waitForTimeout(900);
let a = await heard(A), b = await heard(B);
const aDrop = a.find((s) => s.kind === "drop"), bDrop = b.find((s) => s.kind === "drop");
check("A слышит свой дроп громко и слева", aDrop && aDrop.gain === 1 && aDrop.x < -0.2, a);
check("B слышит чужой дроп тише", bDrop && bDrop.gain < 1, b);
check("звук не повторился ответом сервера", a.filter((s) => s.kind === "drop").length === 1, a);

// 2. Двойной тап — переворот.
const f = (await spots(A)).felt[0];
await A.mouse.click(f.x, f.y);
await A.waitForTimeout(60);
await A.mouse.click(f.x, f.y);
await A.waitForTimeout(1200);
a = await heard(A);
b = await heard(B);
check("A слышит свой переворот", a.some((s) => s.kind === "turn" && s.gain === 1), a);
check("тап по карте — не стук", !a.some((s) => s.kind === "drop"), a);
check("B слышит переворот тоже", b.some((s) => s.kind === "turn" && s.gain < 1), b);

// 3. A берёт карту в свою руку — звук сзади, у B — там, где стул A.
await drag(A, (await spots(A)).deckTop, { x: 195, y: 790 });
await A.waitForTimeout(1000);
a = await heard(A);
b = await heard(B);
const aHand = a.find((s) => s.kind === "hand"), bHand = b.find((s) => s.kind === "hand");
check("A слышит карту в свою руку — сзади, стуком place-1", aHand && aHand.z > 0.5 && aHand.gain === 1 && aHand.file === "drop", a);
check("B слышит карту в чужую руку, тише", bHand && bHand.gain < 1, b);

// 3б. A выносит карту из руки на сукно — скольжение slide-1.
{
  const card = await A.evaluate(() => { const r = document.querySelector("[data-card]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await drag(A, card, { x: middle.x + 2 * k, y: middle.y + 1.5 * k });
  await A.waitForTimeout(1000);
  a = await heard(A);
  const out = a.find((s) => s.kind === "out");
  check("A: из руки на стол — скольжение slide-1, не стук", out && out.file === "hand" && !a.some((s) => s.kind === "drop"), a);
}

// 4. Звук выключен — плеер молчит.
await A.click("[data-settings]");
await A.waitForTimeout(200);
check("в настройках есть «Без звука», по умолчанию выключен", (await A.getAttribute("[data-look=mute]", "aria-checked")) === "false");
await A.click("[data-look=mute]");
await A.click("[data-settings-close]");
await A.waitForTimeout(300);
await heard(A);
await drag(A, (await spots(A)).deckTop, { x: middle.x + 3 * k, y: middle.y - 1.5 * k });
await A.waitForTimeout(900);
a = await heard(A);
b = await heard(B);
check("выключил — A не слышит ничего", a.length === 0, a);
check("у B звук свой — он слышит, сбоку (у него стол повёрнут)", b.some((s) => s.kind === "drop" && Math.abs(s.x) > 0.2), b);
await A.reload();
await A.waitForSelector("[data-settings]");
await A.click("[data-settings]");
check("выключенный звук помнится после перезагрузки", (await A.getAttribute("[data-look=mute]", "aria-checked")) === "true");

// 5. Сборка в стопку, мерж стопки в колоду, шафл — у того, кто делает (B), и у A (звук у него снова включён).
await A.click("[data-look=mute]");
await A.click("[data-settings-close]");
const wait = (p, ms = 300) => p.waitForTimeout(ms);
const lay = async (p, dx) => {
  const now = await spots(p);
  const before = new Set(now.felt.map((f) => f.id));
  await drag(p, now.deckTop, { x: now.middle.x + dx * now.k, y: now.middle.y + 2.4 * now.k });
  await wait(p, 700);
  return (await spots(p)).felt.find((f) => !before.has(f.id));
};
const laid = [await lay(B, -1.4), await lay(B, 0)];
const pilesBefore = new Set((await spots(B)).piles.map((x) => x.id));
await B.click('[data-section="lasso"]');
await wait(B, 400);
for (const one of laid) {
  const f = (await spots(B)).felt.find((x) => x.id === one.id);
  await B.mouse.click(f.x, f.y);
  await wait(B, 350);
}
await heard(A);
await heard(B);
await B.locator('[data-lasso-act="gather"]').dispatchEvent("pointerdown");
await wait(B, 900);
a = await heard(A);
b = await heard(B);
check("B собрал в стопку — B слышит сборку громко", b.some((s) => s.kind === "gather" && s.gain === 1) && !b.some((s) => s.kind === "drop"), b);
check("A слышит сборку тише", a.some((s) => s.kind === "gather" && s.gain < 1), a);
await B.click('[data-section="lasso"]');
await wait(B, 400);
const made = (await spots(B)).piles.find((x) => !pilesBefore.has(x.id));
const gripAt = async (id) => {
  const r = await B.locator(`[data-g="deck-grip"][data-pile="${id}"]`).boundingBox();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
{
  const g0 = await gripAt(made.id);
  await heard(A);
  await heard(B);
  await B.mouse.move(g0.x, g0.y);
  await B.mouse.down();
  await B.mouse.move(g0.x, g0.y - 40, { steps: 4 });
  await B.mouse.move(g0.x - 60, g0.y - 60, { steps: 8 });
  await wait(B, 150);
  await B.mouse.up();
  await wait(B, 900);
  a = await heard(A);
  b = await heard(B);
  check("стопку перенесли по столу — стук у B и у A", b.some((s) => s.kind === "drop" && s.gain === 1) && a.some((s) => s.kind === "drop"), { a, b });
}
const gb0 = await gripAt(made.id);
const gb = { x: gb0.x - 1, y: gb0.y - 1, width: 2, height: 2 };
const deckTop = (await spots(B)).deckTop;
await heard(A);
await heard(B);
await B.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
await B.mouse.down();
await B.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2 - 40, { steps: 4 });
await B.mouse.move(deckTop.x, deckTop.y + 10, { steps: 12 });
await wait(B, 150);
await B.mouse.up();
await wait(B, 900);
a = await heard(A);
b = await heard(B);
check("B вмержил стопку в колоду — мерж у B, обрыв по перелёту 260 мс", b.some((s) => s.kind === "merge" && s.gain === 1 && s.cutMs === 260), b);
check("и у A", a.some((s) => s.kind === "merge"), a);
const grip = await B.locator('[data-g="deck-grip"][data-pile="deck"]').boundingBox();
await B.mouse.click(grip.x + grip.width / 2, grip.y + grip.height / 2);
await wait(B, 450);
await heard(A);
await heard(B);
await B.locator('[data-deck-do="shuffle"]').dispatchEvent("pointerdown");
await wait(B, 900);
a = await heard(A);
b = await heard(B);
check("шафл слышат оба, обрыв с концом веера (1300 + 7×18 мс)", b.some((s) => s.kind === "shuffle" && s.cutMs === 1426) && a.some((s) => s.kind === "shuffle" && s.cutMs === 1426), { a, b });
const served = await B.evaluate(() => [...new Set(performance.getEntriesByType("resource").map((r) => new URL(r.name).pathname).filter((n) => n.startsWith("/table/sounds/")))].sort());
check("грузятся только выбранные записи", served.join() === ["drop-1", "gather-1", "gather-2", "gather-3", "hand-1", "merge-1", "shuffle-1", "turn-1"].map((n) => `/table/sounds/${n}.m4a`).join(), served);

// КЛАВИША PLAY/PAUSE не должна гасить стол: усыплённый не нами контекст просыпается сам.
const audio = await A.evaluate(async () => {
  const ctx = window.__tableAudio;
  if (!ctx) return { has: false };
  const session = navigator.mediaSession;
  await ctx.suspend();
  const asleep = ctx.state;
  await new Promise((r) => setTimeout(r, 400));
  return { has: true, asleep, now: ctx.state, playback: session?.playbackState ?? null };
});
check("аудио стола вообще открыто", audio.has, audio);
check("усыплённый пультом контекст просыпается сам", audio.now === "running", audio);
check("стол не выдаёт себя за проигрыватель", audio.playback === "none", audio);

for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableSound ${checks.filter((c) => c.ok).length}/${checks.length}`);
await browser.close();
process.exit(checks.every((c) => c.ok) ? 0 : 1);
