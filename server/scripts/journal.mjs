// ЖУРНАЛ ГЛАЗАМИ РАЗБОРА. Читает ленту комнаты и показывает её так, чтобы разбор жалобы стоил один
// запуск, а не чтение простыни.
//
// Смысл именно в этом. Сырые записи можно вычитывать и руками, но тогда каждая жалоба — это полчаса
// чтения; здесь на те же данные заранее заданы вопросы, которые к журналу и приходят задавать.
//
//   node scripts/journal.mjs                       какие комнаты вообще есть
//   node scripts/journal.mjs <комната>             лента: что и когда случилось
//   node scripts/journal.mjs <комната> --кто tg:42 только про одного человека
//   node scripts/journal.mjs <комната> --боль      только плохое: отказы, впустую, падения, тишина
//   node scripts/journal.mjs <комната> --стол      партия ходами, без рассказов экрана
//
// Откуда читать — `TABLE_BASE` и `TABLE_SECRET` (по умолчанию локальный стол).

const base = process.env.TABLE_BASE ?? "http://localhost:2590";
const secret = process.env.TABLE_SECRET ?? "dev";

const args = process.argv.slice(2);
const room = args.find((a) => !a.startsWith("--"));
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const ask = async (path) => {
  const res = await fetch(`${base}${path}`, { headers: { "x-table-secret": secret } });
  if (!res.ok) {
    console.error(`Журнал не ответил: ${res.status}. Стол на ${base}? Секрет верный?`);
    process.exit(1);
  }
  return res.json();
};

const when = (ms) => new Date(ms).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

if (!room) {
  const { rooms } = await ask("/table/journal");
  if (rooms.length === 0) console.log("Журнал пуст.");
  else {
  console.log("КОМНАТЫ, О КОТОРЫХ ЖУРНАЛ ПОМНИТ\n");
  for (const r of rooms) {
    console.log(`  ${r.room}  ${when(r.first)} — ${when(r.last)}  ${String(r.deeds).padStart(5)} записей`);
  }
  console.log(`\nДальше: node scripts/journal.mjs ${rooms[0].room}`);
  }
} else {
  const who = valueOf("--кто");
  const { deeds } = await ask(`/table/journal?room=${encodeURIComponent(room)}&limit=5000${who ? `&who=${encodeURIComponent(who)}` : ""}`);
  if (deeds.length === 0) {
    console.log("Про эту комнату журнал ничего не помнит.");
    process.exit(0);
  }

  /** Плохое — то, ради чего в журнал и приходят. */
  const БОЛЬ = new Set(["refused", "press.idle", "boom", "open.failed", "voice.silent"]);
  const shown = deeds.filter((d) => (has("--боль") ? БОЛЬ.has(d.kind) : has("--стол") ? d.side === "table" : true));

  const t0 = deeds[0].at;
  const people = new Map();
  for (const d of deeds) if (d.who) people.set(d.who, (people.get(d.who) ?? 0) + 1);

  console.log(`КОМНАТА ${room}`);
  console.log(`${when(deeds[0].at)} — ${when(deeds[deeds.length - 1].at)}, записей ${deeds.length}`);
  console.log(`Люди: ${[...people].map(([k, n]) => `${k} (${n})`).join(", ") || "—"}\n`);

  for (const d of shown) {
    const sec = ((d.at - t0) / 1000).toFixed(1).padStart(7);
    const side = d.side === "table" ? "стол " : "экран";
    const hurt = БОЛЬ.has(d.kind) ? "!" : " ";
    let what = "";
    if (d.what !== undefined) {
      // Дифы стола показываются коротко: в разборе важно, ЧТО за ход, а не каждая карта в нём.
      what = d.kind === "patch" ? `v${d.what.v}, ${d.what.ops?.length ?? 0} изменений: ${[...new Set((d.what.ops ?? []).map((o) => o.t))].join(",")}` : JSON.stringify(d.what);
    }
    console.log(`${hurt}${sec}с ${side} ${String(d.who ?? "—").padEnd(16)} ${d.kind.padEnd(12)} ${what.slice(0, 110)}`);
  }

  // СВОДКА — то, что видно только целиком, и то, с чего разбор обычно и начинается.
  const count = (kind) => deeds.filter((d) => d.kind === kind).length;
  const idle = deeds.filter((d) => d.kind === "press.idle");
  console.log(`\nИТОГО: ходов ${count("act")}, отказов ${count("refused")}, нажатий ${count("press")} (впустую ${idle.length}), падений ${count("boom")}`);
  if (idle.length > 0) {
    const where = new Map();
    for (const d of idle) where.set(d.what?.g ?? "?", (where.get(d.what?.g ?? "?") ?? 0) + 1);
    console.log(`ЖАЛИ ВПУСТУЮ: ${[...where].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ×${n}`).join(", ")}`);
  }
  const whys = deeds.filter((d) => d.kind === "refused").map((d) => d.what?.why);
  if (whys.length > 0) console.log(`СТОЛ ОТКАЗЫВАЛ: ${[...new Set(whys)].join(", ")}`);
  const sound = deeds.filter((d) => d.kind === "sound").at(-1);
  if (sound) console.log(`ЗВУК: ${sound.what.state}${sound.what.why ? `, молчал (${sound.what.why})` : ""}, просили ${sound.what.asked}, прозвучало ${sound.what.played}`);
  const silent = deeds.filter((d) => d.kind === "voice.silent").at(-1);
  if (silent) console.log(`ГОЛОС НЕ ДОЕХАЛ ОТ: ${silent.what.mute.join(", ")}`);
}
