// ЗАПАСНОЙ УЗЕЛ НА FLY — последняя ступень (Voyager → мак → Fly).
//
// Живёт на маленькой всегда включённой машине и сам НИЧЕГО не обслуживает, пока основные работают: только
// смотрит на реле и реестр узлов. Если стол никто не отдаёт долго (дольше, чем нужно маку, чтобы подхватить
// первым), поднимает здесь стол и бота; когда кто-то из основных вернулся, гасит их. Решения — те же, что у
// надзирателя на маке (`../failover/decide.mjs`), только пороги другие.
//
// База: пока основной жив, раз в две минуты забирает его снимок по HTTP (`/table/admin/snapshot`, под секретом).

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decide, fresh, readRegistry } from "../failover/decide.mjs";

const EVERY_MS = 15_000;
const REPLICA_EVERY_MS = 120_000;
const LIMITS = { failAfter: Number(process.env.STANDBY_FAIL_AFTER) || 16, recoverAfter: Number(process.env.STANDBY_RECOVER_AFTER) || 4 };
const ID = process.env.NODE_ID || "fly";
const RELAY = (process.env.TABLE_RELAY_URL || "").replace(/\/+$/, "");
const SECRET = process.env.TABLE_SECRET || "";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const OWNER = (process.env.TABLE_OWNERS || "").split(",").map((s) => /^tg:(\d+)$/.exec(s.trim())?.[1]).find(Boolean);
const APP = process.env.STANDBY_APP_DIR || "/app";
const DATA = join(APP, "data");
const REPLICA = join(DATA, "replica", "crossade.db");

const log = (...a) => console.log(new Date().toISOString().replace("T", " ").slice(0, 19), ...a);

if (!RELAY || !SECRET) {
  log("TABLE_RELAY_URL и TABLE_SECRET обязательны — без них запасному узлу не за чем следить");
  process.exit(1);
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function probe() {
  const relayUp = await getJson(`${RELAY}/relay/table`).then((s) => s.up === true, () => null);
  const nodes = await getJson(`${RELAY}/table/admin/nodes`, { "x-table-secret": SECRET }).then((s) => s.nodes ?? [], () => null);
  // «Кто-то другой отдаёт стол» — запись в реестре, а не прямая проба: Fly не ходит к Voyager и маку сам.
  const seen = readRegistry(nodes, ID);
  return { voyagerTable: seen.otherTable, relayUp, liveBot: seen.liveBot };
}

async function notify(text) {
  log("→ хозяину:", text);
  if (!OWNER || !TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: OWNER, text }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => log("Telegram не принял:", String(e)));
}

async function pullReplica() {
  mkdirSync(join(DATA, "replica"), { recursive: true });
  const res = await fetch(`${RELAY}/table/admin/snapshot`, { headers: { "x-table-secret": SECRET }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  writeFileSync(`${REPLICA}.tmp`, Buffer.from(await res.arrayBuffer()));
  renameSync(`${REPLICA}.tmp`, REPLICA);
}

function restoreReplica() {
  if (!existsSync(REPLICA)) return "снимка базы нет — стол начнёт с той базы, что на томе";
  const live = join(DATA, "crossade.db");
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  if (existsSync(live)) copyFileSync(live, `${live}.before-${stamp}`);
  for (const ext of ["", "-wal", "-shm"]) rmSync(`${live}${ext}`, { force: true });
  copyFileSync(REPLICA, live);
  return "база заменена снимком основного";
}

/** Дочерний процесс, который перезапускается, пока он нужен. */
function keep(name, cmd, args, opts) {
  let wanted = false;
  let child = null;
  const run = () => {
    if (!wanted) return;
    child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("exit", (code) => {
      log(`${name} вышел (${code})`);
      child = null;
      if (wanted) setTimeout(run, 5000);
    });
  };
  return {
    start() { if (wanted) return; wanted = true; run(); },
    stop() { wanted = false; child?.kill("SIGTERM"); },
  };
}

const table = keep("стол", "node", ["dist/index.js"], { cwd: APP, env: { ...process.env, PORT: process.env.PORT || "8080" } });
const bot = keep("бот", "node", ["--import", "tsx", "src/index.ts"], { cwd: join(APP, "bot"), env: process.env });

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { table.stop(); bot.stop(); setTimeout(() => process.exit(0), 3000); });

let state = fresh();
let lastReplica = 0;
log(`запасной узел Fly «${ID}» запущен: пороги ${LIMITS.failAfter}/${LIMITS.recoverAfter} проб по ${EVERY_MS / 1000} с`);
while (true) {
  try {
    const p = await probe();
    const out = decide(state, p, LIMITS);
    state = out.state;
    log(`пробы: реле=${p.relayUp} другой-стол=${p.voyagerTable} бот-на-стороне=${p.liveBot === null ? "?" : p.liveBot.other} | стол ${state.table.on ? "ON" : "off"}(${state.table.bad}/${state.table.good}) бот ${state.bot.on ? "ON" : "off"}(${state.bot.bad}/${state.bot.good})`);

    if (out.actions.table === "start") {
      const how = restoreReplica();
      table.start();
      await notify(`🆘 Ни Voyager, ни мак не отвечают: стол поднят на Fly (${how}).`);
    }
    if (out.actions.bot === "start") {
      bot.start();
      await notify("🆘 Бота нигде нет: бот поднят на Fly.");
    }
    if (out.actions.table === "stop") {
      table.stop();
      await notify("✅ Основной узел вернулся: стол на Fly остановлен.");
    }
    if (out.actions.bot === "stop") {
      bot.stop();
      await notify("✅ Бот вернулся на основном узле: бот на Fly остановлен.");
    }

    if (!state.table.on && p.voyagerTable && Date.now() - lastReplica >= REPLICA_EVERY_MS) {
      lastReplica = Date.now();
      await pullReplica().then(() => log("снимок базы обновлён"), (e) => log("снимок не забрался:", String(e)));
    }
  } catch (e) {
    log("ошибка цикла:", String(e));
  }
  await new Promise((r) => setTimeout(r, EVERY_MS));
}
