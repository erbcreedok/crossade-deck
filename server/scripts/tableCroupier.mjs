// КРУПЬЕ — своё место вне кольца, своя рука; окно крупье у админа с кнопками, у игрока — без них.
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableCroupier.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const api = (method, path, payload) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-table-secret": secret },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });

const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
/** Подписанный `initData` — тем же токеном, с каким поднят тестовый сервер: вход настоящей дверью Telegram. */
const initDataFor = (id, name, token = "test") => {
  const user = JSON.stringify({ id, first_name: name });
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AA", user };
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", key).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
};

const browser = await chromium.launch();
const open = async (name, tg) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  await p.route("https://telegram.org/**", (r) => r.abort());
  if (tg) {
    await p.addInitScript((initData) => {
      window.Telegram = {
        WebApp: {
          initData, initDataUnsafe: {}, platform: "ios", version: "8.0", isFullscreen: false,
          ready() {}, expand() {}, disableVerticalSwipes() {}, isVersionAtLeast: () => true,
          onEvent() {}, SettingsButton: { show() {}, onClick() {} },
          HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
        },
      };
    }, tg);
  }
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(400);
  return p;
};
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
/** Открыть окно стула крупье: его место видно в списке мест. */
const openCroupier = async (p) => {
  const seats = (await spots(p)).seats ?? [];
  const his = seats.find((sp) => sp.croupier);
  if (!his) return null;
  await p.mouse.click(his.x, his.y);
  await p.waitForTimeout(400);
  return his;
};

// Комнату открывает бот от лица админа — он и будет админом стола.
await api("POST", "/table/rooms", { home: { kind: "chat", chat: `night-${Date.now()}`, chatTitle: "Крупье" }, by: "tg:1", room });
const A = await open("A", initDataFor(1, "Админ"));
const B = await open("B");
await A.waitForTimeout(400);
const mapA = await spots(A);
const admin = mapA.admin;
check("админ — тот, кто открыл комнату", admin === mapA.me, { admin, me: mapA.me });

// Крупье садится командой — той же, что придёт из бота.
const seated = await api("POST", `/table/rooms/${room}/run`, { by: admin, command: { t: "croupier", on: true } });
check("команда принята", seated.status === 200, seated.status);
await A.waitForTimeout(800);

const seats = (await spots(A)).seats ?? [];
const his = seats.find((sp) => sp.croupier);
check("крупье виден за столом, и он один", Boolean(his) && seats.filter((sp) => sp.croupier).length === 1, seats.map((sp) => sp.key));
check("своего места игрок не потерял", seats.some((sp) => sp.key === mapA.mine && !sp.croupier));
// Он вне кольца, но НА ЭКРАНЕ: за краем до него не дотянуться пальцем.
const mineSeat = seats.find((sp) => sp.key === mapA.mine);
check("крупье виден на экране целиком", his.x - his.r > 0 && his.x + his.r < 390 && his.y - his.r > 0 && his.y + his.r < 844, his);
check("сидит дальше от стола, чем игроки", Math.abs(his.x - 195) + Math.abs(his.y - 337) > 0 && his.key !== mineSeat.key);

// Окно крупье: у админа кнопки, у игрока их нет.
await openCroupier(A);
check("у админа в окне крупье — кнопки", (await A.$$eval("[data-croupier]", (els) => els.map((e) => e.dataset.croupier))).includes("deal"), await A.$$eval("[data-croupier]", (els) => els.length));
await openCroupier(B);
check("у игрока кнопок крупье нет", (await B.$$eval("[data-croupier]", (els) => els.length)) === 0);

// Окно раздачи — отдельным окном, с вопросами. Кнопки нет (крупье не дотянуться) — дальше не идём.
if (!(await A.$('[data-croupier="deal"]'))) {
  check("кнопка «Раздать» доступна", false, "окно крупье не открылось");
  await browser.close();
  for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
  console.log(`tableCroupier ${checks.filter((c) => c.ok).length}/${checks.length}`);
  process.exit(1);
}
await A.click('[data-croupier="deal"]');
await A.waitForSelector("[data-deal-panel]");
check("«Раздать» открывает своё окно", (await A.$("[data-deal-panel]")) !== null);
check("в нём спрашивают пресет и сколько карт", (await A.$$eval("[data-deal-rule]", (els) => els.length)) === 4 && (await A.$$eval("[data-deal-n]", (els) => els.length)) > 0);
await A.click('[data-deal-rule="durak"]');
check("пресет выбирается", (await A.getAttribute('[data-deal-rule="durak"]', "aria-pressed")) === "true");
await A.click("[data-deal-shut]");
check("окно закрывается", (await A.$("[data-deal-panel]")) === null);

// Увести крупье: его карты падают на стол, сам он уходит. Окно крупье у админа всё ещё открыто.
await A.click('[data-croupier="remove"]');
await A.waitForTimeout(800);
check("«Увести крупье» убирает его со стола", !((await spots(A)).seats ?? []).some((sp) => sp.croupier));

await browser.close();
for (const c of checks) console.log(c.ok ? "✓" : "✗", c.name, c.ok ? "" : JSON.stringify(c.got));
console.log(`tableCroupier ${checks.filter((c) => c.ok).length}/${checks.length}`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
