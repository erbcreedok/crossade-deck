#!/usr/bin/env python3
"""
Исполнитель без окна: один агент Antigravity (`agy`) на один git worktree.

  agent.py run  <имя> <модель> <задача.md> [шагов] [токенов]
      модель: имя из `agy models` (Antigravity, лимит Google) или `claude:sonnet` / `claude:opus`
      (Claude Code CLI, лимит подписки Claude) — два исполнителя, одна доска
                                             — поднять воркtree, положить задачу, запустить агента в фоне;
                                               бюджет по умолчанию 150 шагов / 300k токенов — дальше стоп
  agent.py kill <имя>                        — остановить агента
  agent.py ls                                — состояние всех агентов одной строкой каждый

Каждый агент живёт в `.worktrees/<имя>` на ветке `agent/<имя>` от `main`; в `main` не пишет и не пушит.
Всё, что про него известно, лежит в `.agent/agents/<имя>/`:
  status.json — состояние (для доски), log.ndjson — сырой поток agy, tail.txt — последние действия,
  prompt.md — что ему было сказано, NEXT.md — сама задача, pid — процесс.
"""
import json, os, shutil, signal, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AGENTS = ROOT / ".agent" / "agents"
WORKTREES = ROOT / ".worktrees"
AGY = os.path.expanduser("~/.local/bin/agy")
CLAUDE = os.path.expanduser("~/.local/bin/claude")
TAIL_LINES = 40


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sh(cmd, cwd=None, check=True) -> str:
    r = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True, text=True)
    if check and r.returncode != 0:
        raise SystemExit(f"$ {cmd}\n{r.stdout}{r.stderr}")
    return r.stdout.strip()


def write_status(d: Path, **patch):
    p = d / "status.json"
    cur = json.loads(p.read_text()) if p.exists() else {}
    cur.update(patch)
    cur["updated"] = now()
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(cur, ensure_ascii=False, indent=1))
    tmp.replace(p)
    return cur


# ---------------------------------------------------------------- worktree

def ensure_worktree(name: str) -> Path:
    wt = WORKTREES / name
    branch = f"agent/{name}"
    if not wt.exists():
        WORKTREES.mkdir(exist_ok=True)
        branches = sh(["git", "branch", "--list", branch], cwd=ROOT)
        if branches:
            sh(["git", "worktree", "add", str(wt), branch], cwd=ROOT)
        else:
            sh(["git", "worktree", "add", "-b", branch, str(wt), "main"], cwd=ROOT)
    # Правила и воркфлоу — те же, что в main (они в git, но NEXT/REPORT/agents — нет).
    for sub in ("rules", "workflows"):
        src, dst = ROOT / ".agent" / sub, wt / ".agent" / sub
        if src.exists():
            shutil.copytree(src, dst, dirs_exist_ok=True)
    # node_modules: ставим из кэша один раз; дальше воркtree переживает много задач.
    if not (wt / "node_modules").exists():
        subprocess.run(["npm", "ci", "--prefer-offline", "--no-audit", "--no-fund"], cwd=wt, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    return wt


# ---------------------------------------------------------------- prompt

def prompt_for(wt: Path, name: str) -> str:
    return f"""Ты — исполнитель. Твой рабочий каталог: {wt} (git worktree, ветка agent/{name}).
Работай ТОЛЬКО внутри этого каталога. Не открывай файлы за его пределами (ни ~/.claude, ни соседние репозитории, ни другие worktree).

Порядок:
1. Прочитай через view_file, по абсолютным путям: {wt}/.agent/rules/orchestrator.md, {wt}/CLAUDE.md, {wt}/game-kit/CANONS.md (если есть), затем задачу: {wt}/.agent/NEXT.md. Скрытые папки поиском по имени не находятся — только view_file по пути. Если NEXT.md не открылся — остановись и скажи об этом.
2. Исследуй код, который задача называет, ДО правок. Составь короткий план по пунктам задачи.
3. Выполни задачу: тест → код → прогон, по пунктам. Не выходи за её границы. Чужие комментарии не удалять и не пересказывать — переносить дословно.
4. Прогони проверки, которые задача называет. Красное — чини, не отчитывайся красным.
5. Закоммить свои файлы по явным путям (`git add <путь> ...`), сообщение по-русски одной фразой в стиле `git log`, в конце `[skip ci]`. Никогда не `git push`. Файлы `.agent/*` не коммитить.
6. Перепиши {wt}/.agent/REPORT.md: заголовок = заголовок NEXT.md; «Закрыто», «Осталось», «Вопросы», «Прогон» (команды и числа), хэш коммита.
Заканчивай ответ одной строкой: `ИТОГ: <хэш коммита или «без коммита»> — <одна фраза>`.
"""


# ---------------------------------------------------------------- run

DEFAULT_STEPS = 150
DEFAULT_TOKENS = 2_000_000


def run(name: str, model: str, task: Path, max_steps: int = DEFAULT_STEPS, max_tokens: int = DEFAULT_TOKENS):
    d = AGENTS / name
    if d.exists() and (d / "pid").exists() and alive(int((d / "pid").read_text() or 0)):
        raise SystemExit(f"{name}: уже работает (pid {(d / 'pid').read_text()})")
    d.mkdir(parents=True, exist_ok=True)
    for f in ("log.ndjson", "tail.txt"):
        (d / f).write_text("")
    write_status(d, name=name, model=model, state="preparing", task=task.read_text().splitlines()[0][:160],
                 started=now(), steps=0, tools=0, tokens=0, last="", commit=None, branch=f"agent/{name}")
    wt = ensure_worktree(name)
    sh(["git", "checkout", "-q", f"agent/{name}"], cwd=wt, check=False)
    shutil.copy(task, wt / ".agent" / "NEXT.md")
    shutil.copy(task, d / "NEXT.md")
    prompt = prompt_for(wt, name)
    (d / "prompt.md").write_text(prompt)
    write_status(d, state="running", worktree=str(wt), budget={"steps": max_steps, "tokens": max_tokens})
    # Сам агент — в фоне, отвязан от этой оболочки; наблюдатель — этот же скрипт в режиме watch.
    pid = os.fork()
    if pid:
        print(f"{name}: запущен, воркtree {wt}, лог {d / 'log.ndjson'}")
        return
    os.setsid()
    watch(name, model, wt, d, prompt, max_steps, max_tokens)


def watch(name, model, wt: Path, d: Path, prompt: str, max_steps: int, max_tokens: int):
    log = open(d / "log.ndjson", "a")
    # ДВА ИСПОЛНИТЕЛЯ, ОДИН ПОТОК. Antigravity и Claude Code оба умеют работать без окна и оба
    # говорят NDJSON — разными словами; здесь это переводится в одну ленту для доски.
    claude = model.startswith("claude:")
    cmd = (
        [CLAUDE, "-p", prompt, "--model", model.split(":", 1)[1], "--output-format", "stream-json",
         "--verbose", "--dangerously-skip-permissions"]
        if claude
        else [AGY, "--model", model, "--output-format", "stream-json", "--dangerously-skip-permissions",
              "--print-timeout", "3h", f"--print={prompt}"]
    )
    proc = subprocess.Popen(
        cmd,
        cwd=wt, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
        # В СВОЕЙ ГРУППЕ ПРОЦЕССОВ. Наблюдатель и агент были в одной: «убить агента» убивало и
        # наблюдателя, и доска до конца дней показывала «работает» тому, кого уже нет.
        start_new_session=True,
    )
    (d / "pid").write_text(str(proc.pid))
    tail: list[str] = []
    steps = tools = tokens = 0
    result = None
    over = None
    for line in proc.stdout:
        log.write(line)
        log.flush()
        try:
            e = json.loads(line)
        except ValueError:
            tail.append(line.rstrip()[:200])
            continue
        ev = e.get("event")
        if claude:
            t = e.get("type")
            if t == "assistant":
                for part in (e.get("message") or {}).get("content") or []:
                    if part.get("type") == "tool_use":
                        tools += 1
                        steps += 1
                        inp = part.get("input") or {}
                        what = inp.get("command") or inp.get("file_path") or inp.get("pattern") or inp.get("path") or ""
                        tail.append(f"▸ {part.get('name')}  {str(what)[:160]}")
                    elif part.get("type") == "text" and part.get("text", "").strip():
                        tail.append("💬 " + part["text"].strip().replace("\n", " ")[:300])
                u = (e.get("message") or {}).get("usage") or {}
                # Только то, что модель прочла и написала заново. Запись в кэш — это весь контекст ещё раз
                # на каждом шаге; считать её — значит убить агента за минуту на шестнадцатом шаге.
                tokens += u.get("output_tokens", 0) + u.get("input_tokens", 0)
            elif t == "rate_limit_event":
                w = ((e.get("rate_limit_info") or {}).get("unifiedWindows") or {})
                write_status(d, limits={k: round((v or {}).get("utilization", 0) * 100) for k, v in w.items()})
            elif t == "result" or ("is_error" in e and "total_cost_usd" in e):
                result = {"status": "ERROR" if e.get("is_error") else "SUCCESS", "response": e.get("result") or "",
                          "cost": e.get("total_cost_usd"), "error": e.get("result") if e.get("is_error") else ""}
        elif ev == "step_update":
            su = e["step_update"]
            if su.get("state") != "DONE" and su.get("step_type") != "tool":
                continue
            steps = max(steps, su.get("step_index", 0))
            u = su.get("usage") or {}
            tokens += u.get("input_tokens", 0) + u.get("output_tokens", 0)
            if su.get("step_type") == "tool" and su.get("state") == "ACTIVE":
                tools += 1
                p = (su.get("tool_info") or {}).get("parameters") or {}
                what = p.get("CommandLine") or p.get("AbsolutePath") or p.get("TargetFile") or p.get("Query") or ""
                tail.append(f"▸ {su.get('tool_name')}  {str(what)[:160]}")
            elif su.get("step_type") == "agent_response" and su.get("text_delta"):
                tail.append("💬 " + su["text_delta"].strip().replace("\n", " ")[:300])
        elif ev == "result":
            result = e["result"]
        del tail[:-TAIL_LINES]
        (d / "tail.txt").write_text("\n".join(tail))
        write_status(d, steps=steps, tools=tools, tokens=tokens, last=tail[-1] if tail else "")
        # БЮДЖЕТ. Агент, которому не сказали «хватит», читает всё подряд по триста шагов и выжигает
        # квоту за час. Перебор — стоп на месте; что успел, остаётся в воркtree, доска говорит «budget».
        if steps > max_steps or tokens > max_tokens:
            over = f"бюджет: шагов {steps}/{max_steps}, токенов {tokens}/{max_tokens}"
            tail.append("⛔ " + over)
            (d / "tail.txt").write_text("\n".join(tail))
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except OSError:
                proc.terminate()
            break
    proc.wait()
    commit = sh(["git", "log", "-1", "--format=%h %s"], cwd=wt, check=False)
    main = sh(["git", "log", "-1", "--format=%h", "main"], cwd=ROOT, check=False)
    ahead = sh(["git", "rev-list", "--count", f"main..agent/{name}"], cwd=ROOT, check=False)
    ok = proc.returncode == 0 and result and result.get("status") == "SUCCESS"
    state = "budget" if over else ("done" if ok else "failed")
    write_status(d, state=state, finished=now(), exit=proc.returncode, over=over,
                 commit=commit, ahead=int(ahead or 0), main=main,
                 response=(result or {}).get("response", "")[-1500:], tokens=tokens, cost=(result or {}).get("cost"))
    (d / "pid").unlink(missing_ok=True)


# ---------------------------------------------------------------- kill / ls

def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def kill(name: str):
    d = AGENTS / name
    p = d / "pid"
    if not p.exists():
        print(f"{name}: не запущен")
        return
    pid = int(p.read_text())
    try:
        os.killpg(os.getpgid(pid), signal.SIGTERM)
    except OSError:
        os.kill(pid, signal.SIGTERM)
    write_status(d, state="killed", finished=now())
    p.unlink(missing_ok=True)
    print(f"{name}: остановлен")


def ls():
    for d in sorted(AGENTS.iterdir()) if AGENTS.exists() else []:
        s = d / "status.json"
        if s.exists():
            j = json.loads(s.read_text())
            print(f"{j['name']:10} {j['state']:9} {j.get('model',''):24} шагов {j.get('steps',0):4}  {j.get('last','')[:80]}")


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        print(__doc__)
    elif a[0] == "run" and 4 <= len(a) <= 6:
        run(a[1], a[2], Path(a[3]).resolve(), *(int(x) for x in a[4:]))
    elif a[0] == "kill" and len(a) == 2:
        kill(a[1])
    elif a[0] == "ls":
        ls()
    else:
        print(__doc__)
        sys.exit(2)
