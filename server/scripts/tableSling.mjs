// СИЛЬНЫЙ БРОСОК РОГАТКОЙ — карту из руки оттягивают вниз, видна стрелка и место приземления; отпустил —
// карта летит и бьёт о стол у ВСЕХ; вернул палец — натяг снят, и карта не вылетает.
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2597 npx tsx src/index.ts
//   node scripts/tableSling.mjs [base] [secret] [shot.png]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2597";
const secret = process.argv[3] ?? "probe";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const ask = (p, i = {}) => fetch(base + p, { ...i, headers: { "x-table-secret": secret, "content-type": "application/json" } });
const run = async (command) => (await ask(`/table/rooms/${room}/run`, { method: "POST", body: JSON.stringify({ by: "tg:7", command }) })).json();
function initData(id, name) {
  const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name, username: name.toLowerCase() }) };
  const sum = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  return new URLSearchParams({ ...f, hash: createHmac("sha256", key).update(sum).digest("hex") }).toString();
}

await ask("/table/rooms", { method: "POST", body: JSON.stringify({ by: "tg:7", home: { kind: "inline", message: "m" }, kind: "krest", room }) });
const browser = await chromium.launch();
const open = async (id, name) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.addInitScript((d) => {
    const a = {};
    Object.defineProperty(a, "WebApp", { value: { initData: d, initDataUnsafe: {}, ready() {}, expand() {} } });
    Object.defineProperty(window, "Telegram", { value: a });
  }, initData(id, name));
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(500);
  return p;
};
const A = await open(7, "Ye");
const B = await open(8, "Bo");
const state = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__tableState())));
const seats = (await state(A)).chairs.filter((c) => c.owner === "tg:7" || c.owner === "tg:8").map((c) => c.id);
check("двое за столом", seats.length === 2, seats);
check("раздача принята", (await run({ t: "deal", rule: "each", n: 3, seats, force: true })).ok === true);
await A.waitForTimeout(3500);

const slams = (p) => p.evaluate(() => (window.__tableSounds ?? []).filter((one) => one.kind === "slam").length);
const sling = (p) => p.evaluate(() => {
  const el = document.querySelector("[data-sling]");
  return el ? { power: Number(el.dataset.power), land: el.dataset.land } : null;
});
const myHand = async () => (await state(A)).chairs.find((c) => c.owner === "tg:7").hand.map((c) => c.id);
/** Середина карты руки на экране — за неё и берутся. */
const grip = async () => {
  const box = await A.locator("[data-card]").first().boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// ── 1. Потянул — натяг; вернул — натяга нет; отпустил — карта в руке, удара нет ─────────────────────
let at = await grip();
const before = await myHand();
await A.mouse.move(at.x, at.y);
await A.mouse.down();
await A.mouse.move(at.x, at.y + 12, { steps: 4 });
check("чуть потянул — натяга ещё нет", (await sling(A)) === null, await sling(A));
await A.mouse.move(at.x, at.y + 60, { steps: 6 });
const pulled = await sling(A);
check("оттянул вниз — стрелка натяга и место приземления", pulled !== null && pulled.power > 0 && (await A.$("[data-felt-mark], [data-g=ring-slot]")) !== null, pulled);
await A.mouse.move(at.x, at.y + 4, { steps: 6 });
check("вернул палец — натяг снят", (await sling(A)) === null, await sling(A));
await A.mouse.up();
await A.waitForTimeout(900);
check("отпустил после отмены — карта осталась в руке", (await myHand()).length === before.length, [before, await myHand()]);
check("и удара не было", (await slams(A)) === 0, await slams(A));

// ── 2. Средний бросок прямо вверх — середина стола, то есть круг хода, со снеппингом ────────────────
at = await grip();
const id = (await A.locator("[data-card]").first().getAttribute("data-card")) ?? "";
await A.mouse.move(at.x, at.y);
await A.mouse.down();
await A.mouse.move(at.x, at.y + 60, { steps: 8 });
const aimed = await sling(A);
check("средний натяг целится в круг хода", (await A.$("[data-g=ring-slot]")) !== null, aimed);
await A.screenshot({ path: process.argv[4] ?? "sling.png" });
await A.mouse.up();
await A.waitForTimeout(1200);
const ringB = (await state(B)).piles.find((one) => one.id === "ring")?.cards.map((c) => c.id) ?? [];
check("у соседа карта легла в круг хода", ringB.includes(id), { id, ringB });
check("у соседа след броска", (await state(B)).trails[id]?.thrown === true, (await state(B)).trails[id]);
check("у меня удар прозвучал", (await slams(A)) === 1, await slams(A));
check("у соседа удар прозвучал", (await slams(B)) === 1, await slams(B));

// ── 3. Полный бросок — к дальней кромке, на сукно ──────────────────────────────────────────────────
at = await grip();
const far = (await A.locator("[data-card]").first().getAttribute("data-card")) ?? "";
await A.mouse.move(at.x, at.y);
await A.mouse.down();
await A.mouse.move(at.x, at.y + 110, { steps: 8 });
check("полный натяг — сила 1", (await sling(A))?.power === 1, await sling(A));
await A.mouse.up();
await A.waitForTimeout(1200);
const feltB = (await state(B)).felt.find((one) => one.id === far);
check("полный бросок лёг на сукно, а не в круг", feltB !== undefined, feltB);
check("далеко от меня: за серединой стола", feltB !== undefined && feltB.y < 0, feltB);
check("и снова удар у обоих", (await slams(A)) === 2 && (await slams(B)) === 2, [await slams(A), await slams(B)]);

await browser.close();
for (const one of checks) console.log(one.ok ? "✓" : "✗", one.name, one.ok ? "" : JSON.stringify(one.got));
console.log(`${checks.filter((one) => one.ok).length}/${checks.length}`);
if (checks.some((one) => !one.ok)) process.exitCode = 1;
