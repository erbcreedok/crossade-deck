// ПЕРЕЗАГРУЗКА СТРАНИЦЫ: тот же браузер под тем же именем возвращается тем же человеком на тот же стул — стулья не плодятся; другое имя или другой браузер — новый человек.
// Нужен живой стол, страница — с самого сервера:
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в server/)
//   node rejoin-check.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(new URL("../server/scripts/x.mjs", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:2599", secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
await fetch(`${base}/table/rooms`, { method: "POST", headers: { "x-table-secret": secret, "content-type": "application/json" }, body: JSON.stringify({ by: "tg:1", home: { kind: "inline", message: "m" }, kind: "cards", room }) });
const browser = await chromium.launch();
const errors = [];
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
const open = async (ctx, name) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); await p.goto(`${base}/table/3d?room=${room}&name=${name}&test`); await p.waitForFunction(() => window.__t3d && document.querySelector("#stage canvas"), null, { timeout: 15000 }); await p.waitForTimeout(1200); return p; };
const who = (p) => p.evaluate(() => { const s = window.__t3d.state(); const me = s.people.find((x) => x.key === window.__t3d.me()); const ch = s.chairs.find((c) => c.id === me?.seat); return { key: window.__t3d.me(), angle: ch?.angle, chairs: s.chairs.filter((c) => !c.croupier).length }; });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const first = await who(await open(ctx, "Ян"));
// Закрыли и открыли снова (перезагрузка): тот же ключ, тот же стул, стульев не больше.
for (const p of ctx.pages()) await p.close();
await new Promise((r) => setTimeout(r, 1500));
const again = await who(await open(ctx, "Ян"));
check("перезагрузка под тем же именем в том же браузере — тот же человек", again.key === first.key, { first, again });
check("и то же место за столом (тот же угол), новые стулья не плодятся", again.angle === first.angle && again.chairs === first.chairs, { first, again });
// Другой браузер (чистая память) — новый человек.
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const other = await who(await open(ctx2, "Ян"));
check("другой браузер под тем же именем — новый человек", other.key !== first.key, { first, other });
// Другое имя в том же браузере — тоже новый человек (две вкладки для проверки).
const named = await who(await open(ctx, "Вера"));
check("другое имя в том же браузере — другой человек", named.key !== first.key, { first, named });
await browser.close();
check("без ошибок страницы", errors.length === 0, errors);
for (const c of checks) console.log(c.ok ? "ok  " : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
