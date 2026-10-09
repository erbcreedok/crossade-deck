// НАДЗИРАТЕЛЬ ЗАПАСНОГО УЗЛА — живёт на маке, следит за Voyager и сам поднимает и гасит запасные стол и бота.
//
// Каждые 15 секунд собирает три пробы (`decide.mjs` решает, что они значат):
//   — стол Voyager отвечает напрямую (по tailnet);
//   — люди видят стол через постоянный адрес (реле);
//   — в реестре узлов есть живой бот НЕ с этой машины.
// Основной жив — раз в две минуты забирает снимок его базы. Основной упал — кладёт снимок на место базы
// мака, поднимает запасные стол и бота и пишет хозяину в Telegram. Основной вернулся — гасит их.
//
// База, с которой мак работал, пока стоял за основного, НЕ теряется: перед снимком она откладывается рядом
// (`crossade.db.before-<время>`), а когда Voyager вернётся, его база главная — слить две автоматически нельзя.

import { execFile as execFileCb } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { decide, fresh, isRunning } from "./decide.mjs";
import { sendReport, standbyNote, standbyReport } from "./report.mjs";
import { statSync } from "node:fs";

const execFile = promisify(execFileCb);
const ROOT = join(homedir(), "Desktop", "crossade-deck");
const UID = process.getuid();
const EVERY_MS = 15_000;
const REPLICA_EVERY_MS = 120_000;
const MAC_ID = process.env.NODE_ID || hostname();
const VOYAGER_HEALTH = process.env.VOYAGER_HEALTH || "https://voyager-crossade.tail5ece90.ts.net/health";
const LABELS = { table: "com.crossade.failover-table", bot: "com.crossade.failover-bot" };

const envOf = (file) => Object.fromEntries(readFileSync(file, "utf8").split("\n").map((l) => /^([A-Z_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const tableEnv = envOf(join(ROOT, "server", ".env.table"));
const botEnv = envOf(join(ROOT, "bot", ".env"));
const RELAY = (tableEnv.TABLE_RELAY_URL || "").replace(/\/+$/, "");
const SECRET = tableEnv.TABLE_SECRET || "";
const OWNER = (tableEnv.TABLE_OWNERS || "").split(",").map((s) => /^tg:(\d+)$/.exec(s.trim())?.[1]).find(Boolean);

const log = (...a) => console.log(new Date().toISOString().replace("T", " ").slice(0, 19), ...a);

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function probe() {
  const voyagerTable = await fetch(VOYAGER_HEALTH, { signal: AbortSignal.timeout(8000) }).then((r) => r.ok, () => false);
  const relayUp = await getJson(`${RELAY}/relay/table`).then((s) => s.up === true, () => null);
  const liveBot = await getJson(`${RELAY}/table/admin/nodes`, { "x-table-secret": SECRET }).then(
    (s) => ({ other: (s.nodes ?? []).some((n) => n.role === "bot" && n.up && n.polling && n.id !== MAC_ID) }),
    () => null,
  );
  return { voyagerTable, relayUp, liveBot };
}

const launchctl = (...args) => execFile("launchctl", args).then((r) => r.stdout, (e) => { throw new Error(e.stderr || e.message); });
/** Запущено ли задание прямо сейчас (а не просто зарегистрировано в launchd — так бывает после каждого входа в систему). */
const loaded = (label) => launchctl("print", `gui/${UID}/${label}`).then(isRunning, () => false);

async function start(label) {
  const plist = join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
  await launchctl("bootstrap", `gui/${UID}`, plist).catch(() => {});
  await launchctl("kickstart", "-k", `gui/${UID}/${label}`);
}
const stop = (label) => launchctl("bootout", `gui/${UID}/${label}`).catch(() => {});

async function notify(text) {
  log("→ хозяину:", text);
  await execFile("osascript", ["-e", `display notification ${JSON.stringify(text)} with title "Crossade: запасной узел"`]).catch(() => {});
  if (!OWNER || !botEnv.TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${botEnv.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: OWNER, text }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => log("Telegram не принял:", String(e)));
}

const DATA = join(ROOT, "server", "data");
const REPLICA = join(DATA, "replica", "crossade.db");

/** Забрать снимок базы Voyager — только пока он жив: у упавшего снимать нечего. */
async function pullReplica() {
  mkdirSync(join(DATA, "replica"), { recursive: true });
  await execFile("rsync", ["-a", "-e", "ssh -o BatchMode=yes -o ConnectTimeout=8", "voyager:crossade-deck/backup/crossade.db", `${REPLICA}.tmp`], { timeout: 60_000 });
  renameSync(`${REPLICA}.tmp`, REPLICA);
}

/** Положить снимок на место базы мака; прежнюю не выбрасывать. */
function restoreReplica() {
  if (!existsSync(REPLICA)) return "снимка базы нет — мак начнёт с той базы, что у него была";
  const live = join(DATA, "crossade.db");
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  if (existsSync(live)) copyFileSync(live, `${live}.before-${stamp}`);
  for (const ext of ["", "-wal", "-shm"]) rmSync(`${live}${ext}`, { force: true });
  copyFileSync(REPLICA, live);
  return "база мака заменена снимком Voyager";
}

let state = fresh();
state.table.on = await loaded(LABELS.table);
state.bot.on = await loaded(LABELS.bot);
log(`надзиратель запущен: стол на маке ${state.table.on ? "включён" : "выключен"}, бот на маке ${state.bot.on ? "включён" : "выключен"}`);

let lastReplica = 0;
let lastReport = 0;
const STARTED = Date.now();
const COMMIT = await execFile("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"]).then((r) => r.stdout.trim(), () => "");
const replicaAge = () => { try { return (Date.now() - statSync(REPLICA).mtimeMs) / 1000; } catch { return null; } };
while (true) {
  try {
    const p = await probe();
    const out = decide(state, p);
    state = out.state;
    log(`пробы: voyager=${p.voyagerTable} реле=${p.relayUp} бот-на-стороне=${p.liveBot === null ? "?" : p.liveBot.other} | стол ${state.table.on ? "ON" : "off"}(${state.table.bad}/${state.table.good}) бот ${state.bot.on ? "ON" : "off"}(${state.bot.bad}/${state.bot.good})`);

    if (out.actions.table === "start") {
      const how = restoreReplica();
      await start(LABELS.table);
      await notify(`⚠️ Voyager не отвечает: стол поднят на маке (${how}).`);
    }
    if (out.actions.bot === "start") {
      await start(LABELS.bot);
      await notify("⚠️ Бота на Voyager нет: бот поднят на маке.");
    }
    if (out.actions.table === "stop") {
      await stop(LABELS.table);
      await notify("✅ Voyager вернулся: стол на маке остановлен. Партии, сыгранные пока он стоял, остались в базе мака (crossade.db.before-…).");
    }
    if (out.actions.bot === "stop") {
      await stop(LABELS.bot);
      await notify("✅ Бот на Voyager вернулся: бот на маке остановлен.");
    }

    if (Date.now() - lastReport >= 30_000) {
      lastReport = Date.now();
      await sendReport(RELAY, SECRET, standbyReport({ id: MAC_ID, host: hostname(), startedAt: STARTED, commit: COMMIT, note: standbyNote({ tableOn: state.table.on, botOn: state.bot.on, replicaAgeSec: replicaAge() }) }));
    }

    if (!state.table.on && p.voyagerTable && Date.now() - lastReplica >= REPLICA_EVERY_MS) {
      lastReplica = Date.now();
      await pullReplica().then(() => log("снимок базы Voyager обновлён"), (e) => log("снимок не забрался:", String(e).split("\n")[0]));
    }
  } catch (e) {
    log("ошибка цикла:", String(e));
  }
  await new Promise((r) => setTimeout(r, EVERY_MS));
}
