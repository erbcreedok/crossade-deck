// ВХОД В ЗАПИСЬ. Грузит ленту комнаты и отдаёт её тому же экрану, что рисует живой стол.
//
//   /table/replay?room=<комната>&secret=<секрет стола>
//
// Секрет не сохраняется: журнал — это ключи людей, их нажатия и ошибки их браузеров, и страница
// разбора не должна оставлять к нему ключ в чужом браузере.

import type { Person } from "../src/table/contract.js";
import { mountScreen } from "./screen.js";
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
  const secret = params.get("secret");
  if (!room || !secret) return say("Нужны комната и секрет: /table/replay?room=…&secret=…");

  // Секрет идёт заголовком, а заголовок держит только латиницу: кириллица в нём роняет сам запрос,
  // и без этой сети страница падала бы молча вместо простого «не подошёл».
  let res: Response;
  try {
    res = await fetch(`${HOST}/table/journal?room=${encodeURIComponent(room)}&limit=5000`, { headers: { "x-table-secret": secret } });
  } catch {
    return say("Секрет не подошёл: в нём есть буквы, которых не бывает в ключе.");
  }
  if (!res.ok) return say(res.status === 401 || res.status === 403 ? "Секрет не подошёл." : `Журнал не ответил: ${res.status}`);
  const { deeds } = (await res.json()) as { deeds: Told[] };
  if (deeds.length === 0) return say("Про эту комнату журнал ничего не помнит.");

  // Смотрим глазами того, кто в этой партии играл: раскраска «своё / чужое» тогда та же, что видел он.
  const played = deeds.find((d) => d.kind === "join" && d.who !== undefined);
  const me: Person = { key: played?.who ?? "", name: "разбор", ink: "#e8c34e", door: "guest" };

  let replay;
  try {
    replay = replayStore(deeds, me);
  } catch (err) {
    return say(err instanceof Error ? err.message : String(err));
  }

  mountScreen(stage, replay.store);
  const t0 = deeds[0]!.at;
  bar.max = String(replay.moments.length - 1);

  const show = (): void => {
    const moment = replay.moments[replay.at]!;
    bar.value = String(replay.at);
    nowText.textContent = `${((moment.at - t0) / 1000).toFixed(1)}с   ${replay.at + 1} / ${replay.moments.length}`;
    deedText.textContent = lineOf(moment.deed, t0);
    deedText.className = HURT.has(moment.deed.kind) ? "hurt" : "";
  };
  replay.onSeek(show);
  replay.seek(0);

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
