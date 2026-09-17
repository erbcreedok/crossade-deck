// ПАРТИЯ НА ЭКРАНЕ: чей ход и чем можно ходить — видно ГЛАЗАМИ, а не только по отказам сервера.
//
// Состояние партии приезжает в снимке (`Snapshot.play`), подсветку экран выводит из него тем же
// разбором, что и сервер. Ломается это тихо: сервер судит верно, а человек не понимает, почему его
// карта не ложится.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tablePlay.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
const api = (method, path, payload) =>
  fetch(`${base}${path}`, { method, headers: { "x-table-secret": secret, "content-type": "application/json" }, ...(payload ? { body: JSON.stringify(payload) } : {}) }).then((r) => r.json());

await api("POST", "/table/rooms", { by: "tg:1", home: { kind: "inline", message: "m" }, kind: "krest", room });

const browser = await chromium.launch();
const open = async (name) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForTimeout(700);
  return p;
};
/** Карты моей руки с пометкой партии: «ляжет» или «не сейчас». */
const hand = (p) => p.evaluate(() => [...document.querySelectorAll("[data-card][data-owner]")]
  .filter((e) => e.getBoundingClientRect().top > 600)
  .map((e) => e.dataset.play ?? "none"));
const play = (p) => p.evaluate(() => JSON.parse(document.querySelector("canvas").dataset.spots).play ?? null);

/** Распорядитель садится за стол настоящей дверью Telegram: раздача идёт от его лица. */
const initData = (() => {
  const user = JSON.stringify({ id: 1, first_name: "Админ" });
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AA", user };
  const line = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update("test").digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", key).update(line).digest("hex") }).toString();
})();
const A = await (async () => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.route("https://telegram.org/**", (r) => r.abort());
  await p.addInitScript((data) => {
    window.Telegram = {
      WebApp: {
        initData: data, initDataUnsafe: {}, platform: "ios", version: "8.0",
        ready() {}, expand() {}, disableVerticalSwipes() {}, isVersionAtLeast: () => true,
        onEvent() {}, SettingsButton: { show() {}, onClick() {} },
        HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
      },
    };
  }, initData);
  await p.goto(`${base}/table/?room=${room}`);
  await p.waitForSelector("[data-section]");
  await p.waitForTimeout(700);
  return p;
})();
const B = await open("B");
await A.waitForTimeout(500);

check("партии нет — подсказок нет", (await hand(A)).every((h) => h === "none"), await hand(A));

// Раздача крестового: все карты по рукам, партия пошла.
const out = await api("POST", `/table/rooms/${room}/run`, { by: "tg:1", command: { t: "deal", rule: "krest" } });
check("раздача пошла", out.ok === true, out);
await A.waitForTimeout(36 * 150 + 2500);

const [a, b] = [await hand(A), await hand(B)];
const mine = [a, b];
check("карты розданы обоим", a.length > 0 && b.length > 0, [a.length, b.length]);
check("ПАРТИЯ ИДЁТ — рука размечена: у каждой карты есть ответ", mine.every((h) => h.every((one) => one !== "none")), mine);
check("ТОЛЬКО У ОДНОГО ЕСТЬ ЧЕМ ХОДИТЬ: круг открывает тот, чей ход", [a, b].filter((h) => h.includes("lay")).length === 1, mine);
check("у второго все карты пригашены — не его черёд", [a, b].filter((h) => h.every((one) => one === "idle")).length === 1, mine);

// ХОД СДЕЛАН — И ВТОРОМУ ВИДНО, ЧЕМ КРЫТЬ: часть руки горит, часть пригашена.
const opener = a.includes("lay") ? A : B;
const other = opener === A ? B : A;
const mid = await opener.evaluate(() => JSON.parse(document.querySelector("canvas").dataset.spots).middle);
const card = await opener.evaluate(() => {
  const one = [...document.querySelectorAll('[data-card][data-play="lay"]')].at(-1);
  const r = one.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + 8 };
});
await opener.mouse.move(card.x, card.y);
await opener.mouse.down();
await opener.mouse.move(mid.x, mid.y, { steps: 10 });
await opener.mouse.up();
await opener.waitForTimeout(900);

const after = await hand(other);
check("ход сделан — очередь перешла", (await play(other))?.turn !== null, await play(other));
check("ВТОРОМУ ВИДНО, ЧЕМ КРЫТЬ: часть карт горит, часть пригашена", after.includes("lay") && after.includes("idle"), after);
check("а у сходившего теперь всё пригашено — не его черёд", (await hand(opener)).every((one) => one === "idle"), await hand(opener));

await browser.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "  ok" : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
