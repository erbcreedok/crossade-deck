// ЖИВОЙ ПРОГОН СТОЛА: два браузера в одной комнате, палец одного, глаза другого.
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2590 npx tsx src/index.ts   (в соседнем окне)
//   node scripts/tableE2E.mjs [base] [secret] [outDir]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2590";
const secret = process.argv[3] ?? "dev";
const out = process.argv[4] ?? ".";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const browser = await chromium.launch();
const page = async (name) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForTimeout(1200);
  return p;
};
const a = await page("A");
const b = await page("B");
const cards = (p) => p.evaluate(() => [...document.querySelectorAll("[data-card]")].map((e) => e.dataset.owner));

await a.mouse.move(195, 335);
await a.mouse.down();
await a.waitForTimeout(300);
await a.mouse.move(195, 720, { steps: 10 });
await a.waitForTimeout(300);
await b.screenshot({ path: `${out}/b-sees-lock.png` });
await a.screenshot({ path: `${out}/a-carries.png` });
await a.mouse.up();
await a.waitForTimeout(800);
await a.screenshot({ path: `${out}/a-after.png` });
await b.screenshot({ path: `${out}/b-after.png` });
const handA = await cards(a);
const seatedB = await b.evaluate(() => document.querySelectorAll("[data-card]").length);
console.log(`A держит в руке: ${handA.length}, у B в его руке: ${seatedB}`);
if (handA.length !== 1 || seatedB !== 0) process.exitCode = 1;
await browser.close();
