// ГЛАЗА ЗРИТЕЛЕЙ — открытое окно стопки или стула видно остальным глазом цвета этого человека.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableEyes.mjs [base] [secret]
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
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.route("https://telegram.org/**", (r) => r.abort());
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(400);
  return p;
};
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const eyesOf = (p, spot) => p.$$eval(`[data-eyes="${spot}"] [data-eye]`, (els) => els.map((e) => e.style.background));
const openDeck = async (p) => {
  const grip = await p.locator('[data-g="deck-grip"][data-pile="deck"]').boundingBox();
  await p.mouse.click(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await p.waitForTimeout(350);
};

const A = await open("A");
const B = await open("B");
const C = await open("C");
await A.waitForTimeout(400);

// 1. Никто ничего не открыл — глаз нет.
check("окон нет — глаз нет", (await A.$("[data-eye]")) === null);

// 2. B открыл колоду — A видит глаз у грипа, сам B — нет.
await openDeck(B);
await A.waitForTimeout(400);
const seen = await eyesOf(A, "pile:deck");
check("A видит глаз у грипа колоды", seen.length === 1, seen);
check("свой глаз себе не показывается", (await eyesOf(B, "pile:deck")).length === 0);

// 3. Открыл и C — у A два глаза, порядок по времени открытия.
await openDeck(C);
await A.waitForTimeout(400);
const two = await eyesOf(A, "pile:deck");
check("двое смотрят — два глаза", two.length === 2, two);
check("первым — кто открыл раньше", two[0] !== two[1], two);

// 4. У A тоже открыта колода — глаза переезжают в окно, у грипа их нет.
await openDeck(A);
await A.waitForTimeout(400);
check("моё окно открыто — глаза в окне", (await A.$$eval('[data-g="deck-tip"] [data-eye]', (els) => els.length)) === 2);
check("…и у грипа их больше нет", (await A.$$eval('[data-g="deck-grip"] [data-eye]', (els) => els.length)) === 0);
await openDeck(A);
await A.waitForTimeout(300);

// 5. Окно стула: B и C смотрят на стул A — глаза на ЕГО полосе, лимит там больше.
const mineKey = (await spots(A)).mine;
if (mineKey) {
  for (const p of [B, C]) {
    const seat = (await spots(p)).seats?.find((sp) => sp.key === mineKey);
    if (seat) {
      await p.mouse.click(seat.x, seat.y);
      await p.waitForTimeout(300);
    }
  }
  await A.waitForTimeout(400);
  check("на свой стул смотрят — глаза на моей полосе", (await eyesOf(A, `chair:${mineKey}`)).length >= 1, mineKey);
}

// 6. C ушёл — его глаз погас.
const before = (await eyesOf(A, "pile:deck")).length;
await C.close();
await A.waitForTimeout(700);
const after = (await eyesOf(A, "pile:deck")).length;
check("ушёл из комнаты — глаз погас", after === before - 1, { before, after });

await browser.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableEyes ${checks.filter((c) => c.ok).length}/${checks.length}`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
