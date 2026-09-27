// UNITY ЗА ЖИВЫМ СТОЛОМ: человек из Telegram берёт пропуск, Unity (`native/unity-ar`, `NetCheck.Run`) входит
// с ним тем же человеком, строит стол по снимку — и видит, когда человек из веба кладёт карту на сукно.
//   TABLE_SECRET=probe TABLE_GUESTS=1 TELEGRAM_BOT_TOKEN=test CROSSADE_DB_FILE=":memory:" PORT=2597 npx tsx src/index.ts
//   node scripts/tableUnity.mjs [base] [secret] [shot.png]
import { spawn } from "child_process";
import { createHmac, randomBytes } from "crypto";
import { createRequire } from "module";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const { Client } = require("colyseus.js");

const base = process.argv[2] ?? "http://localhost:2597";
const secret = process.argv[3] ?? "probe";
const shot = process.argv[4] ?? "";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "test";
const UNITY = process.env.UNITY ?? "/Applications/Unity/Hub/Editor/6000.0.75f1/Unity.app/Contents/MacOS/Unity";
const project = fileURLToPath(new URL("../../native/unity-ar", import.meta.url));
const body = randomBytes(8).toString("base64url");
const room = body + createHmac("sha256", secret).update(body).digest("base64url").slice(0, 12);
const checks = [];
const check = (name, ok, got) => checks.push({ name, ok, got });
function initData(id, name) {
  const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: name, username: name.toLowerCase() }) };
  const sum = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  return new URLSearchParams({ ...f, hash: createHmac("sha256", key).update(sum).digest("hex") }).toString();
}

await fetch(`${base}/table/rooms`, { method: "POST", headers: { "x-table-secret": secret, "content-type": "application/json" }, body: JSON.stringify({ by: "tg:7", home: { kind: "inline", message: "m" }, kind: "krest", room }) });
const web = await new Client(base.replace(/^http/, "ws")).joinOrCreate("table_room", { room, client: "html", door: "telegram", initData: initData(7, "Ye"), protocol: 2 });
let state = null;
web.onMessage("*", () => {});
web.onMessage("welcome", (w) => (state = w.snapshot));
web.send("hello");
while (!state) await new Promise((r) => setTimeout(r, 50));
const seat = state.chairs.find((c) => c.owner === "tg:7").id;
const dealt = await (await fetch(`${base}/table/rooms/${room}/run`, { method: "POST", headers: { "x-table-secret": secret, "content-type": "application/json" }, body: JSON.stringify({ by: "tg:7", command: { t: "deal", rule: "each", n: 3, seats: [seat], force: true } }) })).json();
check("раздача принята", dealt.ok === true, dealt);
const pass = await new Promise((done) => {
  web.onMessage("app", (one) => done(one.pass));
  web.send("app");
});
await new Promise((r) => setTimeout(r, 1500));

const lines = [];
const unity = spawn(UNITY, ["-batchmode", "-projectPath", project, "-buildTarget", "iOS", "-executeMethod", "NetCheck.Run", "-logFile", "-"], {
  env: { ...process.env, CROSSADE_CHECK_HOST: base, CROSSADE_CHECK_ROOM: room, CROSSADE_CHECK_PASS: pass, CROSSADE_CHECK_SHOT: shot },
});
let moved = false;
unity.stdout.on("data", (chunk) => {
  for (const line of String(chunk).split("\n")) {
    if (!line.includes("NETCHECK")) continue;
    lines.push(line.trim());
    console.log(line.trim());
    if (line.includes("NETCHECK ready") && !moved) {
      moved = true;
      // Веб кладёт одну карту из руки на сукно — Unity обязан это увидеть. Сначала свежий снимок: в первом
      // рука ещё пустая, раздача пришла позже.
      web.onMessage("welcome", (w) => {
        const card = w.snapshot.chairs.find((c) => c.owner === "tg:7")?.hand[0]?.id ?? "";
        web.send("intent", { t: "grab", id: card });
        web.send("intent", { t: "drop", id: card, to: { in: "felt", x: 0, y: 1, up: true, angle: 15 } });
      });
      web.send("intent", { t: "sync" });
    }
  }
});
const code = await new Promise((done) => unity.on("exit", done));
const first = lines.find((l) => l.includes("welcome 1")) ?? "";
check("Unity вошёл тем же человеком", first.includes("you=tg:7") && first.includes("name=Ye"), first);
check("Unity увидел свои три карты", first.includes("mine=3"), first);
check("стол построен: сукно, стопки и руки — вещами", /built=(\d+)/.test(first) && Number(first.match(/built=(\d+)/)[1]) > 3, first);
check("Unity увидел карту, положенную из веба", code === 0 && lines.some((l) => l.includes("felt=1")), lines.at(-1));
await web.leave();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad += 1;
  console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.ok ? "" : ` — ${JSON.stringify(c.got)}`}`);
}
console.log(`${checks.length - bad}/${checks.length}`);
process.exit(bad ? 1 : 0);
