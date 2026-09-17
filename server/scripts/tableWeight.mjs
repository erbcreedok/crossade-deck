// ЧТО ТЕЛЕФОН ТАЩИТ ПО СЕТИ, открывая стол.
//
// Клиент отдаётся одним файлом на каждый заход и не кэшируется — значит его вес и есть время
// загрузки на телефоне. Вшитая карта исходников весила вчетверо больше самого клиента, и он тащил
// её каждый раз, хотя не открывает никогда. Здесь меряется, что она вынесена и что вес не уполз.
//   TABLE_SECRET=dev TABLE_GUESTS=1 PORT=2599 npx tsx src/index.ts   (в соседнем окне)
//   node scripts/tableWeight.mjs [base]
const base = process.argv[2] ?? "http://localhost:2599";
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });

/** Сколько весит и сколько летит — как его увидит телефон. */
async function fetchSize(path) {
  const t0 = Date.now();
  const body = await (await fetch(`${base}${path}`)).text();
  return { bytes: Buffer.byteLength(body), ms: Date.now() - t0, body };
}

const first = await fetchSize("/table/app.js");
const again = await fetchSize("/table/app.js");

const MOST = 700 * 1024;
check("клиент влезает в 700 КБ", first.bytes < MOST, { kb: Math.round(first.bytes / 1024) });
check("КАРТЫ ИСХОДНИКОВ ВНУТРИ НЕТ — только ссылка на неё", !first.body.includes("sourceMappingURL=data:") && first.body.includes("sourceMappingURL=app.js.map"), first.body.slice(-64));
check("вторая выдача не пересобирает — сборка живёт до выкатки", again.ms <= Math.max(30, first.ms), { first: first.ms, again: again.ms });

const map = await fetchSize("/table/app.js.map");
check("а сама карта отдаётся отдельно — для отладчика", map.bytes > 100 * 1024 && map.body.startsWith("{"), { kb: Math.round(map.bytes / 1024) });

let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(c.ok ? "  ok" : "FAIL", c.name, c.ok ? "" : JSON.stringify(c.got));
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
