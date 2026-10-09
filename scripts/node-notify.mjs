// ОПОВЕЩЕНИЕ УЗЛА О СЕБЕ — каждый сервер (Voyager, мак, Fly) сам говорит хозяину в Telegram, когда он включился и когда выключился. О чужих — нет:
// мак не пишет «Voyager вернулся», когда сам только что включился; про Voyager пишет Voyager.
//
//   node scripts/node-notify.mjs "<кто>" "<что случилось>"      например:  node scripts/node-notify.mjs Voyager "стол включён"
//
// Токен — из bot/.env, получатель — первый из TABLE_OWNERS в server/.env.table. Не получилось — молча выходит с 0: оповещение не должно ронять запуск службы.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const envOf = (file) => { try { return Object.fromEntries(readFileSync(file, "utf8").split("\n").map((l) => /^([A-Z_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")])); } catch { return {}; } };

const [who, what] = process.argv.slice(2);
if (!who || !what) { console.error("usage: node-notify.mjs <кто> <что>"); process.exit(0); }
const token = envOf(join(ROOT, "bot", ".env")).TELEGRAM_BOT_TOKEN;
const owner = (envOf(join(ROOT, "server", ".env.table")).TABLE_OWNERS || "").split(",").map((s) => /^tg:(\d+)$/.exec(s.trim())?.[1]).find(Boolean);
const up = /включ[её]н|поднял|запущен|вернул/i.test(what) && !/выключ/i.test(what);
if (!token || !owner) process.exit(0);
await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: owner, text: `${up ? "🟢" : "🔴"} ${who}: ${what}` }),
  signal: AbortSignal.timeout(8000),
}).catch(() => {});
process.exit(0);
