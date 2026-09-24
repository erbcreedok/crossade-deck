// СТРЕЛКА ОЖИДАНИЯ — «ходит он», вне круга, перед стулом.
//
// Проверяется живым столом, а не глазами: стрелка рисуется на холсте, и «вижу её» — не доказательство.
// Экран объявляет, кому он её рисует (`data-spots.awaited`), и здесь проверяются три закона:
//
//   1. СТРЕЛКА ОДНА И УКАЗЫВАЕТ НА ТОГО, ЧЕЙ ХОД — того же, кого называет судья.
//   2. ОНА ПЕРЕЕЗЖАЕТ ПОСЛЕ ИЗМЕНЕНИЯ КРУГА, а не после любого жеста: поправил карты в своей руке —
//      стрелка стоит, положил в круг — переехала.
//   3. РАСПОРЯДИТЕЛЬ ЕЁ ГАСИТ через крупье, и гаснет она у всех.
//
//   TABLE_SECRET=dev TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test PORT=2599 npx tsx src/index.ts
//   node scripts/tableTurnMark.mjs [base] [secret]
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
const require = createRequire(process.env.PW_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:2599";
const secret = process.argv[3] ?? "dev";
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);

const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

const ask = (path, init = {}) =>
  fetch(`${base}${path}`, { ...init, headers: { "x-table-secret": secret, "content-type": "application/json", ...(init.headers ?? {}) } });

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test";
function initData(id, name) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name, username: name.toLowerCase() }) };
  const sum = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", key).update(sum).digest("hex") }).toString();
}

await ask("/table/rooms", { method: "POST", body: JSON.stringify({ by: "tg:7", home: { kind: "inline", message: "m" }, kind: "krest", room }) });

const browser = await chromium.launch();
const open = async (name, tg) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", (e) => console.log(name, "ERROR", e.message));
  if (tg) await p.addInitScript((data) => {
    const app = {};
    Object.defineProperty(app, "WebApp", { value: { initData: data, initDataUnsafe: {}, ready() {}, expand() {} }, writable: false });
    Object.defineProperty(window, "Telegram", { value: app, writable: false });
  }, initData(tg, name));
  await p.goto(`${base}/table/?room=${room}&name=${name}`);
  await p.waitForSelector("[data-section]");
  await p.waitForSelector(".crossade-loading", { state: "detached" });
  await p.waitForTimeout(500);
  return p;
};

const a = await open("A", 7);
const b = await open("B");
const spots = async (p) => JSON.parse(await p.getAttribute("canvas", "data-spots"));
const snap = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__tableState())));
const awaited = async (p) => (await spots(p)).awaited ?? [];

// РАЗДАЧА КРЕСТОМ — партия начинается, и судья называет чей-то ход.
const me = (await snap(a)).people.find((one) => one.name === "A");
// РАЗДАЁТ РАСПОРЯДИТЕЛЬ — тот, кто завёл комнату: гостю за столом раздача не принадлежит.
const роздано = await (await ask(`/table/rooms/${room}/run`, { method: "POST", body: JSON.stringify({ by: "tg:7", command: { t: "deal", rule: "krest" } }) })).json();
check("раздача прошла", !роздано?.error, роздано);
// РАЗДАЧА ИДЁТ ПО ОДНОЙ КАРТЕ, и партия начинается, только когда она кончилась. Ждём событие, а не
// секунды: на медленной машине фиксированная пауза врёт, и прогон падает не там, где ошибка.
const ждём = async (что, ms = 30000) => {
  for (let ждал = 0; ждал < ms; ждал += 250) {
    if (await что()) return true;
    await a.waitForTimeout(250);
  }
  return false;
};
check("партия началась", await ждём(async () => (await snap(a)).play !== null), null);

const play = (await snap(a)).play;
check("партия идёт — судья назвал ход", play !== null && play.turn !== null, play?.turn ?? null);

const марки = await awaited(a);
check("стрелка одна", марки.length === 1, марки);
const ходит = (await snap(a)).chairs.find((c) => c.owner === play?.turn)?.id ?? null;
check("стрелка у того, чей ход", марки[0] === ходит, { стрелка: марки[0], ход: ходит });
check("и второй экран показывает ту же", JSON.stringify(await awaited(b)) === JSON.stringify(марки), await awaited(b));

// ЖЕСТ, НЕ МЕНЯЮЩИЙ КРУГ, СТРЕЛКУ НЕ ДВИГАЕТ: поправка карт в своей руке — самое частое движение за
// столом, и раньше именно она уводила очередь.
if ((await snap(a)).play === null) {
  console.log("партии нет — раздача не дошла. руки:", JSON.stringify((await snap(a)).chairs.map((c) => ({ id: c.id, n: c.hand.length, owner: c.owner }))));
  await browser.close();
  process.exit(1);
}
const чей = (await snap(a)).play.turn;
const рука = (await snap(a)).chairs.find((c) => c.owner === чей);
const экран = чей === me.key ? a : b;
const карты = (await snap(экран)).chairs.find((c) => c.id === рука.id).hand;
if (карты.length > 1) {
  await экран.evaluate(([id, chair, i]) => {
    window.__tableSend({ t: "grab", id });
    window.__tableSend({ t: "drop", id, to: { in: "hand", chair, i } });
  }, [карты[0].id, рука.id, карты.length - 1]);
  await экран.waitForTimeout(600);
  check("поправка карт в своей руке стрелку не двигает", (await awaited(a))[0] === ходит, await awaited(a));
} else {
  check("поправка карт в своей руке стрелку не двигает", false, "в руке нет двух карт — нечего перекладывать");
}

// ХОД В КРУГ — стрелка переезжает.
const вКруг = карты[0].id;
await экран.evaluate(([id]) => {
  window.__tableSend({ t: "grab", id });
  window.__tableSend({ t: "drop", id, to: { in: "deck", pile: "ring" } });
}, [вКруг]);
await экран.waitForTimeout(900);
const после = await awaited(a);
check("круг изменился — стрелка переехала", после.length === 1 && после[0] !== ходит, { было: ходит, стало: после[0] });
const теперь = await snap(a);
check("и ход у того же, на кого она смотрит", теперь.chairs.find((c) => c.owner === теперь.play.turn)?.id === после[0], после[0]);

// ТУМБЛЕР КРУПЬЕ — гасит у всех.
await a.evaluate(() => window.__tableSend({ t: "crew", act: "turn-mark" }));
await a.waitForTimeout(700);
check("распорядитель погасил указатель", (await awaited(a)).length === 0, await awaited(a));
check("погасло и у второго", (await awaited(b)).length === 0, await awaited(b));

await a.evaluate(() => window.__tableSend({ t: "crew", act: "turn-mark" }));
await a.waitForTimeout(700);
check("зажёг обратно", (await awaited(a)).length === 1, await awaited(a));

await browser.close();
for (const one of checks) console.log(one.ok ? "ok  " : "FAIL", one.name, one.ok ? "" : JSON.stringify(one.got));
const bad = checks.filter((one) => !one.ok).length;
console.log(bad === 0 ? `\nвсё сошлось: ${checks.length}` : `\nпровалов: ${bad} из ${checks.length}`);
process.exit(bad === 0 ? 0 : 1);
