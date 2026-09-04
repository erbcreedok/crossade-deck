#!/usr/bin/env python3
"""
Доска агентов — http://<мак>:9570/ — кто работает, над чем, что делает прямо сейчас.

Читает `.agent/agents/*/status.json` и `tail.txt`, которые пишет `agent.py`; сама ничего не решает.
Единственное действие с доски — «стоп» (POST /api/kill/<имя>).
"""
import json, re, socket, subprocess, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AGENTS = ROOT / ".agent" / "agents"
AGENT_PY = Path(__file__).with_name("agent.py")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9570

PAGE = r"""<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Агенты · crossade-deck</title>
<style>
body{margin:0;background:#111;color:#ddd;font:14px/1.4 ui-monospace,Menlo,monospace}
header{padding:10px 14px;border-bottom:1px solid #333;display:flex;gap:16px;align-items:baseline}
header b{color:#fff}header span{color:#888}
.grid{display:grid;gap:12px;padding:12px;grid-template-columns:repeat(auto-fill,minmax(360px,1fr))}
.card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;min-height:0}
.head{display:flex;justify-content:space-between;align-items:center;gap:8px}
.name{font-weight:700;color:#fff;font-size:16px}
.state{padding:2px 8px;border-radius:999px;font-size:12px}
.running{background:#1f3a2a;color:#7fdc9a}.done{background:#1f2f3f;color:#8ac4ff}.failed,.killed{background:#3f1f1f;color:#ff9a9a}.budget{background:#3f2f1f;color:#ffc48a}.preparing{background:#3a3520;color:#e6d27a}
.meta{color:#999;font-size:12px;display:flex;flex-wrap:wrap;gap:10px}
.task{color:#ccc;white-space:pre-wrap}
pre{margin:0;background:#0d0d0d;border-radius:8px;padding:8px;max-height:260px;overflow:auto;font-size:12px;color:#bbb;white-space:pre-wrap;word-break:break-word}
button{background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:6px;padding:4px 10px;cursor:pointer}
button:hover{background:#3a2a2a}
.resp{color:#8ac4ff;white-space:pre-wrap;font-size:12px;max-height:120px;overflow:auto}
.empty{padding:40px;color:#666;text-align:center}
a{color:#8ac4ff;text-decoration:none}a:hover{text-decoration:underline}
.links{display:flex;flex-wrap:wrap;gap:10px;font-size:12px}
#doors a{margin-right:10px}#doors .off{color:#555}
</style></head><body>
<header><b>Агенты</b><span id="sum">…</span><span id="doors"></span><span style="margin-left:auto" id="clock"></span></header>
<div class="grid" id="grid"></div>
<script>
const fmt=s=>{if(!s)return"";const d=(Date.now()-Date.parse(s))/1000;return d<60?Math.round(d)+"с":d<3600?Math.round(d/60)+"м":(d/3600).toFixed(1)+"ч"};
async function tick(){
  const r=await fetch("/api/agents");const {agents:list,doors}=await r.json();
  document.getElementById("doors").innerHTML=doors.map(d=>d.up?`<a href="${d.url}" target="_blank">${d.name}</a>`:`<span class="off">${d.name} ·</span>`).join("");
  const g=document.getElementById("grid");
  if(!list.length){g.innerHTML='<div class="empty">Никто не работает. Запусти: scripts/agents/agent.py run &lt;имя&gt; &lt;модель&gt; &lt;задача.md&gt;</div>';}
  else g.innerHTML=list.map(a=>`
  <div class="card">
    <div class="head"><span class="name">${a.name}</span><span class="state ${a.state}">${a.state}</span>
      ${a.state==="running"||a.state==="preparing"?`<button onclick="kill('${a.name}')">стоп</button>`:""}</div>
    <div class="task">${esc(a.task||"")}</div>
    <div class="meta"><span>${a.model||""}</span><span>ветка ${a.branch||""}</span><span>шагов ${a.steps||0}${a.budget?` / ${a.budget.steps}`:""}</span><span>инструментов ${a.tools||0}</span><span>токенов ${((a.tokens||0)/1000).toFixed(0)}k${a.budget?` / ${(a.budget.tokens/1000).toFixed(0)}k`:""}</span><span>идёт ${fmt(a.started)}</span>${a.finished?`<span>закончил ${fmt(a.finished)} назад</span>`:""}${a.commit?`<span>коммит: ${esc(a.commit)}</span>`:""}${a.ahead?`<span>+${a.ahead} к main</span>`:""}</div>
    ${a.links&&a.links.length?`<div class="links">где смотреть: ${a.links.map(l=>`<a href="${l.url}" target="_blank">${esc(l.name)}</a>`).join("")}</div>`:""}
    <pre>${esc(a.tail||"")}</pre>
    ${a.response?`<div class="resp">${esc(a.response)}</div>`:""}
  </div>`).join("");
  const run=list.filter(a=>a.state==="running").length;
  document.getElementById("sum").textContent=`${run} в работе · ${list.length} всего`;
  document.getElementById("clock").textContent=new Date().toLocaleTimeString();
}
function esc(s){return String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}
async function kill(n){if(!confirm("Остановить "+n+"?"))return;await fetch("/api/kill/"+n,{method:"POST"});tick()}
tick();setInterval(tick,3000);
</script></body></html>"""


DOORS = [("каталог", 9567, "/?path=/story/live-cards--cards"), ("хаб", 9569, "/"), ("косынка", 9581, "/"), ("хаб (агент)", 9582, "/")]


def up(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.15):
            return True
    except OSError:
        return False


def doors(host: str):
    return [{"name": n, "url": f"http://{host}:{p}{path}", "up": up(p)} for n, p, path in DOORS]


STORIES_INDEX: dict = {"at": 0.0, "ids": []}


def story_ids() -> list:
    """Все id историй каталога, из его же index.json — раз в полминуты, не на каждый запрос."""
    import time, urllib.request
    if time.time() - STORIES_INDEX["at"] < 30:
        return STORIES_INDEX["ids"]
    ids: list = []
    if up(9567):
        try:
            with urllib.request.urlopen("http://127.0.0.1:9567/index.json", timeout=1) as r:
                entries = json.load(r).get("entries", {})
                ids = [k for k, v in entries.items() if v.get("type") == "story"]
        except Exception:
            ids = STORIES_INDEX["ids"]
    STORIES_INDEX.update(at=time.time(), ids=ids)
    return ids


def links_for(name: str, host: str):
    """Где смотреть работу агента: ссылки из его отчёта и страницы каталога, которые он тронул."""
    out = []
    wt = ROOT / ".worktrees" / name
    report = wt / ".agent" / "REPORT.md"
    if report.exists():
        for u in re.findall(r"https?://[^\s)>\]]+", report.read_text(errors="replace")):
            # Туннель живёт до перезапуска, а отчёт — навсегда: ссылка на историю переписывается на
            # локальный каталог, остальные — как есть.
            m = re.search(r"[?&]id=([a-z0-9-]+)", u)
            if m:
                out.append({"name": m.group(1), "url": f"http://{host}:9567/iframe.html?id={m.group(1)}&viewMode=story"})
            elif "trycloudflare" not in u:
                out.append({"name": u.split("//", 1)[1][:60], "url": u})
    # Три точки: только то, что ветка добавила сама, а не всё, чем main ушёл вперёд.
    r = subprocess.run(["git", "diff", "--name-only", f"main...agent/{name}"], cwd=ROOT, capture_output=True, text=True)
    ids = story_ids()
    for f in r.stdout.split():
        if not f.endswith(".stories.ts"):
            continue
        try:
            title = re.search(r"title:\s*[\"'`]([^\"'`]+)", (ROOT / f).read_text(errors="replace"))
        except OSError:
            title = None
        if not title:
            continue
        prefix = re.sub(r"[^a-z0-9]+", "-", title.group(1).lower()).strip("-")
        first = next((i for i in ids if i.startswith(prefix + "--")), None)
        if first:
            out.append({"name": title.group(1), "url": f"http://{host}:9567/?path=/story/{first}"})
    seen = set()
    return [l for l in out if not (l["url"] in seen or seen.add(l["url"]))][:8]


def agents(host: str = "localhost"):
    out = []
    if AGENTS.exists():
        for d in sorted(AGENTS.iterdir()):
            s = d / "status.json"
            if not s.exists():
                continue
            try:
                j = json.loads(s.read_text())
            except ValueError:
                continue
            t = d / "tail.txt"
            j["tail"] = t.read_text()[-6000:] if t.exists() else ""
            j["links"] = links_for(j.get("name", d.name), host)
            out.append(j)
    order = {"running": 0, "preparing": 1, "failed": 2, "budget": 3, "killed": 4, "done": 5}
    out.sort(key=lambda j: (order.get(j.get("state"), 9), j.get("started", "")), reverse=False)
    return out


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype):
        b = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == "/api/agents":
            host = (self.headers.get("Host") or "localhost").split(":")[0]
            self.send(200, json.dumps({"agents": agents(host), "doors": doors(host)}, ensure_ascii=False), "application/json")
        elif self.path.startswith("/api/log/"):
            f = AGENTS / self.path.split("/")[-1] / "log.ndjson"
            self.send(200, f.read_text()[-200000:] if f.exists() else "", "text/plain")
        else:
            self.send(200, PAGE, "text/html")

    def do_POST(self):
        if self.path.startswith("/api/kill/"):
            name = self.path.split("/")[-1]
            r = subprocess.run([sys.executable, str(AGENT_PY), "kill", name], capture_output=True, text=True)
            self.send(200, r.stdout + r.stderr, "text/plain")
        else:
            self.send(404, "", "text/plain")


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
