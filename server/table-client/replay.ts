// ВХОД В ЗАПИСЬ. Грузит ленту комнаты и отдаёт её тому же экрану, что рисует живой стол.
//
//   /table/replay?room=<комната>&pass=<пропуск>      обычный путь: пропуск на одну эту запись
//   /table/replay?room=<комната>&secret=<секрет>     свой стол под рукой
//
// Пропуск лучше секрета ровно тем, что его не жалко: он назван одной комнатой и протухает. Секрет
// стола пускает распоряжаться комнатами, и его место — в `.env.table`, а не в адресной строке
// телефона. Ни то, ни другое страница не сохраняет.

import type { Person } from "../src/table/contract.js";
import { mountScreen } from "./screen.js";
import type { SeenView } from "./watch.js";
import { replayStore, type Told } from "./replayStore.js";
import { HOST } from "./host.js";

const params = new URLSearchParams(location.search);
const stage = document.getElementById("stage")!;
const note = document.getElementById("note")!;
const bar = document.getElementById("bar") as HTMLInputElement;
const nowText = document.getElementById("now")!;
const deedText = document.getElementById("deed")!;
const playButton = document.getElementById("play")!;

const say = (text: string): void => {
  note.textContent = text;
  note.hidden = false;
};

/** Плохое — то, ради чего запись и смотрят. */
const HURT = new Set(["refused", "press.idle", "boom", "open.failed", "voice.silent"]);

/** Событие одной строкой — так же, как его читает разбор в терминале. */
function lineOf(deed: Told, t0: number): string {
  const sec = ((deed.at - t0) / 1000).toFixed(1);
  const who = deed.who ?? "—";
  const what = deed.what === undefined ? "" : deed.kind === "patch" ? `${(deed.what as { ops?: unknown[] }).ops?.length ?? 0} изменений` : JSON.stringify(deed.what).slice(0, 120);
  return `${sec}с  ${deed.side === "table" ? "стол " : "экран"}  ${who}  ${deed.kind}  ${what}`;
}

async function start(): Promise<void> {
  const room = params.get("room");
  const pass = params.get("pass");
  const secret = params.get("secret");
  if (!room || (!pass && !secret)) return say("Нужны комната и пропуск: /table/replay?room=…&pass=…");

  // Секрет идёт заголовком, а заголовок держит только латиницу: кириллица в нём роняет сам запрос,
  // и без этой сети страница падала бы молча вместо простого «не подошёл».
  const where = `${HOST}/table/journal?room=${encodeURIComponent(room)}&limit=5000${pass ? `&pass=${encodeURIComponent(pass)}` : ""}`;
  let res: Response;
  try {
    res = await fetch(where, secret && !pass ? { headers: { "x-table-secret": secret } } : {});
  } catch {
    return say("Ключ не подошёл: в нём есть буквы, которых не бывает в ключе.");
  }
  if (!res.ok) return say(res.status === 401 || res.status === 403 ? (pass ? "Пропуск не подошёл или протух." : "Секрет не подошёл.") : `Журнал не ответил: ${res.status}`);
  const { deeds } = (await res.json()) as { deeds: Told[] };
  if (deeds.length === 0) return say("Про эту комнату журнал ничего не помнит.");

  // ЧЬИМИ ГЛАЗАМИ. За столом трое, и «его рука» у каждого своя: без выбора разобрать жалобу одного
  // из троих нельзя. По умолчанию — тот, кто сел последним; дальше человек переключает сам.
  const players = new Map<string, string>();
  for (const d of deeds) {
    if (d.kind === "join" && d.who) players.set(d.who, (d.what as { name?: string })?.name ?? d.who);
  }
  const asked = params.get("eyes");
  const first = asked && players.has(asked) ? asked : [...players.keys()].at(-1) ?? "";
  const me: Person = { key: first, name: players.get(first) ?? "разбор", ink: "#e8c34e", door: "guest" };

  const eyes = document.getElementById("eyes") as HTMLSelectElement;
  eyes.innerHTML = [...players].map(([key, name]) => `<option value="${key}"${key === first ? " selected" : ""}>глазами ${name}</option>`).join("");

  let replay;
  try {
    replay = replayStore(deeds, me);
  } catch (err) {
    return say(err instanceof Error ? err.message : String(err));
  }

  // ЭКРАН РАЗМЕРОМ С ЕГО ЭКРАН. Стол на телефоне и на десктопе — это разные столы: там, где у него
  // рука закрывала треть поля, у меня остаётся пустое сукно, и половина жалоб на вёрстку становится
  // невидимой. Размер берётся из его же рассказа при открытии.
  const opened = deeds.find((d) => d.kind === "open")?.what as { w?: number; h?: number } | undefined;
  if (opened?.w && opened?.h) {
    const fit = Math.min(1, (innerHeight - 160) / opened.h, innerWidth / opened.w);
    stage.style.width = `${opened.w}px`;
    stage.style.height = `${opened.h}px`;
    stage.style.left = "50%";
    stage.style.right = "auto";
    stage.style.top = "12px";
    stage.style.bottom = "auto";
    stage.style.transform = `translateX(-50%) scale(${fit.toFixed(3)})`;
    stage.style.transformOrigin = "top center";
    stage.style.outline = "1px solid #2a2f30";
    stage.style.borderRadius = "10px";
    stage.style.overflow = "hidden";
  }

  const screen = mountScreen(stage, replay.store);
  // ЧЕСТНОСТЬ ПЕРЕД ЗРИТЕЛЕМ: у восстановленной записи карты, которых не трогали, лежат рубашкой —
  // не потому что они закрыты, а потому что запись про них не знает.
  if (replay.guessed || replay.lost > 0 || replay.older > 0) {
    const warn = document.createElement("div");
    warn.textContent = [
      replay.guessed ? "Кадр восстановлен из ходов: нетронутые карты — рубашкой, их запись не видела." : "",
      replay.lost > 0 ? `Ходов обрезано и потеряно: ${replay.lost} — запись делалась со старым пределом.` : "",
      replay.older > 0 ? `Показана последняя посиделка за этим столом; прежних в журнале ещё ${replay.older}.` : "",
    ].filter(Boolean).join(" ");
    warn.style.cssText = "position:absolute;left:14px;top:10px;background:#3a2f1c;color:#e8c98a;padding:6px 10px;border-radius:7px;font-size:12px;z-index:50";
    stage.appendChild(warn);
  }
  const t0 = deeds[0]!.at;
  bar.max = String(replay.moments.length - 1);

  // ВЗГЛЯД ЧЕЛОВЕКА. Камера едет по записи так же, как ехала у него: берётся последнее, что он
  // сделал с ней до этого мгновения.
  let lastView = "";
  const lookAsHe = (upto: number): void => {
    let seen: SeenView | undefined;
    for (let i = 0; i <= upto; i += 1) {
      const d = replay.moments[i]?.deed;
      if (d?.kind === "view") seen = d.what as SeenView;
    }
    // В самом начале он камеру ещё не трогал — значит стол стоял так, как встал при открытии. Взять
    // первое, что он о ней рассказал: иначе запись открылась бы взглядом ПРОШЛОГО просмотра.
    seen ??= replay.moments.find((m) => m.deed.kind === "view")?.deed.what as SeenView | undefined;
    if (!seen) return;
    const line = JSON.stringify(seen);
    if (line === lastView) return;
    lastView = line;
    screen.look.to(seen);
  };

  const show = (): void => {
    const moment = replay.moments[replay.at]!;
    lookAsHe(replay.at);
    bar.value = String(replay.at);
    nowText.textContent = `${((moment.at - t0) / 1000).toFixed(1)}с   ${replay.at + 1} / ${replay.moments.length}`;
    deedText.textContent = lineOf(moment.deed, t0);
    deedText.className = HURT.has(moment.deed.kind) ? "hurt" : "";
  };
  // Взгляд меняет ВСЁ: чья рука своя, чьи карты видно, чьи права. Проще открыть запись заново тем же
  // мгновением, чем пересобирать экран на ходу.
  eyes.onchange = () => {
    location.search = new URLSearchParams({ ...Object.fromEntries(params), eyes: eyes.value, at: String(replay.at) }).toString();
  };

  replay.onSeek(show);
  replay.seek(Number(params.get("at")) || 0);

  bar.oninput = () => replay.seek(Number(bar.value));
  document.getElementById("back")!.onclick = () => replay.seek(replay.at - 1);
  document.getElementById("fwd")!.onclick = () => replay.seek(replay.at + 1);

  // ИДЁТ В НАСТОЯЩЕМ ВРЕМЕНИ ПАРТИИ: пауза между шагами такая же, какой она была у игрока, — иначе не
  // видно, что он сидел и думал, а что делал в спешке. Длинные паузы поджимаются: смотреть, как
  // человек минуту не трогал стол, незачем.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = (): void => {
    clearTimeout(timer);
    timer = undefined;
    playButton.textContent = "▶";
  };
  const tick = (): void => {
    if (replay.at >= replay.moments.length - 1) return stop();
    const gap = Math.min(2000, Math.max(60, replay.moments[replay.at + 1]!.at - replay.moments[replay.at]!.at));
    timer = setTimeout(() => {
      replay.seek(replay.at + 1);
      tick();
    }, gap);
  };
  playButton.onclick = () => {
    if (timer !== undefined) return stop();
    if (replay.at >= replay.moments.length - 1) replay.seek(0);
    playButton.textContent = "❚❚";
    tick();
  };

  addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") replay.seek(replay.at + 1);
    if (e.key === "ArrowLeft") replay.seek(replay.at - 1);
    if (e.key === " ") {
      e.preventDefault();
      playButton.click();
    }
  });
}

void start().catch((err: unknown) => say(err instanceof Error ? err.message : String(err)));
