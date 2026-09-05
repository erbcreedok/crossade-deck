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
:root{color-scheme:dark}
body{margin:0;background:#16181c;color:#c3c7cd;font:14px/1.45 -apple-system,system-ui,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
header{padding:10px 14px;border-bottom:1px solid #24272d;display:flex;gap:10px 14px;align-items:baseline;flex-wrap:wrap;font-size:13px}
header b{color:#e8eaee;font-weight:600}header span{color:#7d828b}
a{color:#79a6e0;text-decoration:none}a:hover{text-decoration:underline}
#doors a{margin-right:10px}#doors .off{color:#4a4e56}
.row{border-bottom:1px solid #202329;padding:10px 14px;cursor:pointer}
.row:active{background:#1b1e23}
.top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.name{font-weight:600;color:#e8eaee}
.state{padding:1px 8px;border-radius:999px;font-size:11px;letter-spacing:.02em}
.running{background:#1d3327;color:#8fd6a6}.done{background:#1f2937;color:#8fb6e8}.failed,.killed{background:#3a1f22;color:#e8969b}.budget{background:#3a2c1f;color:#e8bd8f}.preparing{background:#35301d;color:#e0d08a}
.when{color:#7d828b;font-size:12px}
.task{color:#a9aeb6;font-size:13px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.last{color:#5f646d;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Menlo,monospace}
.more{display:none;margin-top:8px}
.row.open .more{display:block}
.row.open .task,.row.open .last{white-space:pre-wrap}
.meta{color:#7d828b;font-size:12px;display:flex;flex-wrap:wrap;gap:6px 12px;margin-bottom:6px}
pre{margin:0;background:#101215;border-radius:8px;padding:8px;max-height:260px;overflow:auto;font-size:11px;line-height:1.4;color:#9a9fa8;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,Menlo,monospace}
button{background:#23262c;color:#c3c7cd;border:1px solid #33373f;border-radius:6px;padding:2px 9px;cursor:pointer;font-size:12px}
.resp{color:#8fb6e8;white-space:pre-wrap;font-size:12px;max-height:160px;overflow:auto;margin-top:6px}
.links{font-size:12px;margin-top:6px}.links a{margin-right:10px}
.empty{padding:40px;color:#5f646d;text-align:center}
</style></head><body>
<header><b>Агенты</b><span id="sum">…</span><span id="doors"></span><span id="lim"></span><span style="margin-left:auto" id="clock"></span></header>
<div id="list"></div>
<script>
const open=new Set();
const hm=s=>s?new Date(s).toLocaleTimeString("ru",{hour:"2-digit",minute:"2-digit"}):"";
const dur=(a,b)=>{if(!a)return"";const d=((b?Date.parse(b):Date.now())-Date.parse(a))/60000;return d<1?"<1м":d<60?Math.round(d)+"м":(d/60).toFixed(1)+"ч"};
const ago=s=>{if(!s)return"";const d=(Date.now()-Date.parse(s))/60000;return d<60?Math.round(d)+"м назад":d<1440?(d/60).toFixed(1)+"ч назад":Math.round(d/1440)+"д назад"};
const day=s=>s?new Date(s).toLocaleDateString("ru",{day:"2-digit",month:"2-digit"}):"";
async function tick(){
  const r=await fetch("/api/agents");const {agents:list,doors}=await r.json();
  document.getElementById("doors").innerHTML=doors.map(d=>d.up?`<a href="${d.url}" target="_blank">${d.name}</a>`:`<span class="off">${d.name} ·</span>`).join("");
  const el=document.getElementById("list");
  if(!list.length){el.innerHTML='<div class="empty">Никто не работает.</div>';return;}
  const today=new Date().toLocaleDateString("ru",{day:"2-digit",month:"2-digit"});
  el.innerHTML=list.map(a=>{
    const live=a.state==="running"||a.state==="preparing";
    const d=day(a.started); const dd=d&&d!==today?d+" ":"";
    const when=live?`${dd}${hm(a.started)} → идёт ${dur(a.started)}`:`${dd}${hm(a.started)}–${hm(a.finished||a.updated)} · ${dur(a.started,a.finished||a.updated)} · ${ago(a.finished||a.updated)}`;
    return `<div class="row ${open.has(a.name)?"open":""}" onclick="tog('${a.name}')">
      <div class="top"><span class="name">${a.name}</span><span class="state ${a.state}">${a.state}</span><span class="when">${when}</span><span class="when">шагов ${a.steps||0}${a.cost!=null?` · $${Number(a.cost).toFixed(2)}`:""}</span>${live?`<button onclick="event.stopPropagation();kill('${a.name}')">стоп</button>`:""}</div>
      <div class="task">${esc((a.task||"").replace(/^#\s*/,""))}</div>
      ${live?`<div class="last">${esc(a.last||"")}</div>`:""}
      <div class="more">
        <div class="meta"><span>${a.model||""}</span><span>ветка ${a.branch||""}</span><span>токенов ${((a.tokens||0)/1000).toFixed(0)}k${a.budget?` / ${(a.budget.tokens/1000).toFixed(0)}k`:""}</span>${a.over?`<span>${esc(a.over)}</span>`:""}${a.commit?`<span>коммит: ${esc(a.commit)}</span>`:""}${a.ahead?`<span>+${a.ahead} к main</span>`:""}</div>
        ${a.links&&a.links.length?`<div class="links">где смотреть: ${a.links.map(l=>`<a href="${l.url}" target="_blank" onclick="event.stopPropagation()">${esc(l.name)}</a>`).join("")}</div>`:""}
        <pre>${esc(a.tail||"")}</pre>
        ${a.response?`<div class="resp">${esc(a.response)}</div>`:""}
      </div></div>`}).join("");
  const run=list.filter(a=>a.state==="running").length;
  document.getElementById("sum").textContent=`${run} в работе · ${list.length} всего`;
  const L=list.find(a=>a.limits&&a.limits.five_hour!=null);
  document.getElementById("lim").textContent=L?`лимит 5ч ${L.limits.five_hour}% · нед ${L.limits.seven_day}%`:"";
  document.getElementById("clock").textContent=new Date().toLocaleTimeString();
}
function tog(n){open.has(n)?open.delete(n):open.add(n);tick()}
function esc(s){return String(s).replace(/\/Users\/giyers\/Desktop\/crossade-deck\/\.worktrees\/[^\/\s]+\//g,"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}
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
    # WHO IS WORKING, THEN WHO FINISHED LAST. A dead run from this afternoon is not news; the one
    # that just finished is. Only what is alive gets pinned to the top.
    alive = {"running": 0, "preparing": 0}
    out.sort(key=lambda j: (alive.get(j.get("state"), 1), -_ts(j.get("finished") or j.get("updated") or j.get("started") or "")))
    # ЛИМИТ — один на всех: тот, что видел последний обновлённый агент.
    fresh = max((j for j in out if j.get("limits")), key=lambda j: _ts(j.get("updated") or ""), default=None)
    if fresh:
        out[0]["limits"] = fresh["limits"]
    return out


def _ts(iso: str) -> float:
    from datetime import datetime
    try:
        return datetime.fromisoformat(iso).timestamp()
    except ValueError:
        return 0.0


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
