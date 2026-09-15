// ПЕРЕКЛЮЧАТЕЛЬ НОЧНЫХ СБОРОК — `?build=<номер>` собирает стол из снимка на маке, список сборок виден в настройках.
// Снимок для проверки делается здесь же: настоящий снимается `scripts/nightSnapshot.mjs`.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableBuilds.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const FAKE = 999001;
const server = join(dirname(fileURLToPath(import.meta.url)), "..");
const snap = join(server, "data", "builds", String(FAKE));
mkdirSync(join(snap, "server", "table-client"), { recursive: true });
writeFileSync(join(snap, "server", "table-client", "main.ts"), 'document.title = "snapshot-999001";\n');

const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

try {
  const list = await (await fetch(`${base}/table/builds.json`)).json();
  check("список сборок отдаётся, снимок в нём", Array.isArray(list.builds) && list.builds.includes(FAKE), list);

  const saved = await (await fetch(`${base}/table/app.js?build=${FAKE}`)).text();
  check("?build=<номер> собран из снимка", saved.includes("snapshot-999001"), saved.slice(0, 120));
  check("номер сборки в снимке — его собственный", saved.includes(String(FAKE)), "");

  const live = await (await fetch(`${base}/table/app.js`)).text();
  check("без номера — живое дерево", !live.includes("snapshot-999001") && live.length > 10000, live.length);

  const missing = await (await fetch(`${base}/table/app.js?build=999999`)).text();
  check("снимка нет — молча живое дерево", missing.length > 10000 && !missing.includes("snapshot-999001"), missing.length);

  const evil = await fetch(`${base}/table/app.js?build=..%2F..%2Fetc`);
  check("путь из запроса не читается", evil.status === 200 && (await evil.text()).length > 10000, evil.status);

  // Окно настроек: список сборок и переход по тапу.
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log("ERROR", e.message));
  await p.route("https://telegram.org/**", (r) => r.abort());
  await p.goto(`${base}/table/?room=${room}&name=A`);
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.click("[data-settings]");
  await p.waitForSelector(`[data-build="${FAKE}"]`);
  check("в настройках — «последняя» выбрана", (await p.getAttribute('[data-build=""]', "aria-pressed")) === "true");
  await p.click(`[data-build="${FAKE}"]`);
  await p.waitForFunction((b) => new URLSearchParams(location.search).get("build") === String(b), FAKE);
  check("тап по сборке — стол открыт в ней", new URL(p.url()).searchParams.get("build") === String(FAKE));
  await p.waitForFunction(() => document.title === "snapshot-999001", null, { timeout: 15000 }).catch(() => {});
  check("страница собрана из снимка", (await p.title()) === "snapshot-999001", await p.title());
  await browser.close();
} finally {
  rmSync(snap, { recursive: true, force: true });
}

for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableBuilds ${checks.filter((c) => c.ok).length}/${checks.length}`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
