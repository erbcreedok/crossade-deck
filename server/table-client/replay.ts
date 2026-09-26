// ВХОД В ЗАПИСЬ. Грузит ленту комнаты и отдаёт её тому же экрану, что рисует живой стол.
//
//   /table/replay?room=<комната>&pass=<пропуск>      обычный путь: пропуск на одну эту запись
//   …&from=<номер>&to=<номер>                        одна партия: от её начала до конца (`records.ts`)
//   …&eyes=<ключ>                                    чьими глазами; по умолчанию — глазами крупье
//   /table/replay?room=<комната>&secret=<секрет>     свой стол под рукой
//
// Пропуск лучше секрета ровно тем, что его не жалко: он назван одной комнатой и протухает. Секрет
// стола пускает распоряжаться комнатами, и его место — в `.env.table`, а не в адресной строке
// телефона. Ни то, ни другое страница не сохраняет.

import type { Person } from "../src/table/contract.js";
import { mountScreen } from "./screen.js";
import { replayStore, viewOf, type Told } from "./replayStore.js";
import { cardText, describe, rawSeen, type LogLine } from "./replayLog.js";
import { clusters, MARK_NAMES, markNear, marksOf, type Mark } from "./replayMarks.js";
import { clockText, playhead, REPLAY_MODES, REPLAY_SPEEDS, type ReplayMode } from "./replayClock.js";
import type { Face } from "../src/table/contract.js";
import { HOST } from "./host.js";
import type { SeenView } from "./watch.js";

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

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Карта значком: лицо в цвете масти или рубашка. */
const cardHtml = (face: Face | null): string =>
  `<span class="card${face === null ? " back" : face.suit === "h" || face.suit === "d" || face.suit === "r" ? " red" : ""}">${esc(cardText(face))}</span>`;

/** Строка события: кто — что — какие карты. */
const lineHtml = (line: LogLine): string =>
  `${line.who ? `<span class="who">${esc(line.who)}</span> ` : ""}<span${line.known ? "" : ' class="unknown"'}>${esc(line.says)}</span>${line.cards.length ? ` ${line.cards.map(cardHtml).join(" ")}` : ""}`;

async function start(): Promise<void> {
  const room = params.get("room");
  const pass = params.get("pass");
  const secret = params.get("secret");
  if (!room || (!pass && !secret)) return say("Нужны комната и пропуск: /table/replay?room=…&pass=…");

  // Секрет идёт заголовком, а заголовок держит только латиницу: кириллица в нём роняет сам запрос,
  // и без этой сети страница падала бы молча вместо простого «не подошёл».
  const from = params.get("from");
  const to = params.get("to");
  const lane = from ? `&from=${encodeURIComponent(from)}${to ? `&to=${encodeURIComponent(to)}` : ""}` : "&limit=5000";
  const where = `${HOST}/table/journal?room=${encodeURIComponent(room)}${lane}${pass ? `&pass=${encodeURIComponent(pass)}` : ""}`;
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
  //
  // ПО УМОЛЧАНИЮ — ГЛАЗАМИ КРУПЬЕ: он сидит за столом, но своей игры у него нет, и запись с его места —
  // это просто партия, без «своей руки». Дальше человек переключает сам, на любого игрока.
  const players = new Map<string, string>();
  const framed = deeds.find((d) => (d.kind === "table.first" || d.kind === "match.start") && (d.what as { snapshot?: unknown })?.snapshot);
  const croupier = (framed?.what as { snapshot?: { chairs: { croupier?: boolean; owner: string | null }[] } } | undefined)?.snapshot?.chairs.find((c) => c.croupier)?.owner ?? null;
  if (croupier) players.set(croupier, "крупье");
  for (const d of deeds) {
    if (d.kind === "join" && d.who) players.set(d.who, (d.what as { name?: string })?.name ?? d.who);
    if (d.kind === "match.start") for (const one of (d.what as { игроки?: { key: string; name: string }[] })?.игроки ?? []) if (!players.has(one.key)) players.set(one.key, one.name);
  }
  const asked = params.get("eyes");
  const first = asked && players.has(asked) ? asked : croupier ?? [...players.keys()].at(-1) ?? "";
  const me: Person = { key: first, name: players.get(first) ?? "разбор", ink: "#e8c34e", door: "guest" };

  const eyes = document.getElementById("eyes") as HTMLSelectElement;
  eyes.innerHTML = [...players].map(([key, name]) => `<option value="${key}"${key === first ? " selected" : ""}>глазами ${name}</option>`).join("");

  let replay: ReturnType<typeof replayStore>;
  try {
    replay = replayStore(deeds, me);
  } catch (err) {
    return say(err instanceof Error ? err.message : String(err));
  }

  // ЭКРАН РАЗМЕРОМ С ЕГО ЭКРАН. Стол на телефоне и на десктопе — это разные столы: там, где у него
  // рука закрывала треть поля, у меня остаётся пустое сукно, и половина жалоб на вёрстку становится
  // невидимой. Размер берётся из его же рассказа при открытии.
  const opened = deeds.find((d) => d.kind === "open")?.what as { w?: number; h?: number } | undefined;
  // ПАНЕЛЬ ВЫСОТОЙ СО СВОЁ СОДЕРЖИМОЕ: на узком телефоне ряды переносятся, и стол встаёт над ней, а не
  // под неё — по её настоящей высоте, заново при каждом изменении.
  const panel = document.getElementById("panel")!;
  const fitStage = (): void => {
    const below = panel.offsetHeight;
    document.documentElement.style.setProperty("--panel", `${below}px`);
    if (!opened?.w || !opened?.h) return;
    const fit = Math.min(1, (innerHeight - below - 24) / opened.h, innerWidth / opened.w);
    stage.style.transform = `translateX(-50%) scale(${fit.toFixed(3)})`;
  };
  if (opened?.w && opened?.h) {
    stage.style.width = `${opened.w}px`;
    stage.style.height = `${opened.h}px`;
    stage.style.left = "50%";
    stage.style.right = "auto";
    stage.style.top = "12px";
    stage.style.bottom = "auto";
    stage.style.transformOrigin = "top center";
    stage.style.outline = "1px solid #2a2f30";
    stage.style.borderRadius = "10px";
    stage.style.overflow = "hidden";
  }
  fitStage();
  new ResizeObserver(fitStage).observe(panel);
  addEventListener("resize", fitStage);

  const screen = mountScreen(stage, replay.store, undefined, { watch: true });
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
  const nameOf = (key: string): string => players.get(key) ?? replay.store.state.people.find((p) => p.key === key)?.name ?? (key.startsWith("bot:") ? "бот" : key);
  /** Событие мгновения глазами выбранного зрителя: лица режутся по его месту за столом. */
  const linesAt = (i: number): LogLine[] => describe(replay.moments[i]!.deed, replay.store.state, me.key, nameOf);
  bar.max = String(replay.moments.length - 1);

  // ВЗГЛЯД ЧЕЛОВЕКА — ТОЛЬКО ВЫБРАННОГО. Камера едет по его записи (`viewOf`). Не записана — стол стоит
  // так, как встаёт при открытии с его места, и об этом сказано: чужая камера показала бы чужой стол.
  const blind = document.createElement("div");
  blind.dataset.noCamera = "";
  blind.textContent = "Камера этого игрока не записана — стол показан с его места";
  blind.style.cssText = "position:absolute;right:10px;top:10px;background:#1c2426;color:#9aa3a1;padding:5px 9px;border-radius:7px;font-size:12px;z-index:50;pointer-events:none";
  blind.hidden = true;
  stage.appendChild(blind);
  let lastView = "";
  // ДВА РЕЖИМА КАМЕРЫ. «Как у игрока» — камера едет по его записи. «Свободная» — зритель повёл стол
  // сам (или нажал кнопку), и дальше ракурс держит он: перемотка его не трогает. Кнопка возвращает
  // записанную камеру выбранного игрока на текущее мгновение. Рука и видимость карт — от «чьими
  // глазами», а не от камеры: свободная камера только смотрит с другой стороны.
  let camFree = false;
  /**
   * Ракурс, поставленный зрителем РУКОЙ (с докатом по инерции): перемотка возвращает его. Только от руки —
   * не с экрана после перемотки: там центр уже поджат краем стола под другую руку внизу, и ракурс
   * уползал бы с каждым шагом.
   */
  let freeView: SeenView | null = null;
  const camButton = document.getElementById("cam")!;
  const setFree = (on: boolean): void => {
    camFree = on;
    camButton.textContent = on ? "свободная камера · вернуть" : "камера игрока";
    camButton.toggleAttribute("data-free", on);
    camButton.setAttribute("aria-pressed", String(on));
    if (!on) {
      lastView = "";
      lookAsHe(replay.at);
    } else {
      blind.hidden = true;
      freeView = screen.look.now();
    }
  };
  camButton.onclick = () => setFree(!camFree);
  screen.look.onHand(() => {
    if (!camFree) setFree(true);
    freeView = screen.look.now();
  });
  const lookAsHe = (upto: number): void => {
    if (camFree) {
      // Дважды: сейчас и кадром позже — экран подгоняет камеру под новый кадр (рука выросла) уже на
      // следующей отрисовке, и ракурс зрителя должен лечь поверх этого.
      const keep = freeView;
      if (keep) {
        screen.look.to(keep);
        requestAnimationFrame(() => camFree && freeView === keep && screen.look.to(keep));
      }
      return;
    }
    const his = viewOf(replay.moments, upto, me.key);
    blind.hidden = his !== null;
    // Без камеры — своё место внизу. Стул мог сдвинуться на этом мгновении, поэтому ставится заново
    // на каждом шаге, а не один раз.
    if (his === null) {
      lastView = "";
      return screen.look.home();
    }
    const line = JSON.stringify(his);
    if (line === lastView) return;
    lastView = line;
    screen.look.to(his);
  };

  // РЕЖИМ И СКОРОСТЬ — из адреса: смена глаз перезагружает страницу и не должна их сбрасывать.
  const modeSelect = document.getElementById("mode") as HTMLSelectElement;
  const speedSelect = document.getElementById("speed") as HTMLSelectElement;
  let mode: ReplayMode = REPLAY_MODES.includes(params.get("mode") as ReplayMode) ? (params.get("mode") as ReplayMode) : "time";
  let speed: number = (REPLAY_SPEEDS as readonly number[]).includes(Number(params.get("speed"))) ? Number(params.get("speed")) : 1;
  modeSelect.value = mode;
  speedSelect.value = String(speed);
  let playing = false;
  const ats = replay.moments.map((m) => m.at);
  /** Часы записи: идут непрерывно, пока играет, и стоят на времени шага, пока нет. */
  const clock = (recordAt: number): void => {
    nowText.textContent = `${clockText(recordAt - t0)} / ${clockText(ats[ats.length - 1]! - t0)} · ${replay.at + 1}/${replay.moments.length}`;
    nowText.dataset.recordAt = String(Math.round(recordAt - t0));
  };

  const show = (): void => {
    const moment = replay.moments[replay.at]!;
    lookAsHe(replay.at);
    bar.value = String(replay.at);
    if (!playing) clock(moment.at);
    const lines = linesAt(replay.at);
    deedText.innerHTML = lines.map(lineHtml).join(" · ");
    deedText.className = HURT.has(moment.deed.kind) ? "hurt" : "";
    if (!sheet.hidden) fillSheet(lines);
  };

  // ПОДРОБНОСТИ МГНОВЕНИЯ — лист снизу. Сверху словами, ниже, свёрнуто, — техническое: вид события,
  // сторона, номер и сырое содержимое. Сырое — ради разбора, а не для чтения, поэтому спрятано.
  const sheet = document.getElementById("sheet")!;
  const sheetTitle = document.getElementById("sheetTitle")!;
  const sheetBody = document.getElementById("sheetBody")!;
  let techOpen = false;
  const fillSheet = (lines: LogLine[]): void => {
    const d = replay.moments[replay.at]!.deed;
    sheetTitle.textContent = `${((d.at - t0) / 1000).toFixed(1)} с · ${replay.at + 1} из ${replay.moments.length} · глазами ${players.get(me.key) ?? me.name}`;
    const raw = JSON.stringify(rawSeen(d, replay.store.state, me.key), null, 2) ?? "";
    sheetBody.innerHTML = lines.map((line) => `<div class="line">${lineHtml(line)}</div>`).join("")
      + `<details id="tech"${techOpen ? " open" : ""}><summary>Технические подробности</summary>`
      + `<dl><dt>вид</dt><dd>${esc(d.kind)}</dd><dt>откуда</dt><dd>${d.side === "table" ? "стол" : "экран игрока"}</dd><dt>номер</dt><dd>${d.id}</dd><dt>кто</dt><dd>${esc(d.who ?? "—")}</dd></dl>`
      + `<pre>${esc(raw)}</pre></details>`;
    (sheetBody.querySelector("#tech") as HTMLDetailsElement).ontoggle = (e) => void (techOpen = (e.target as HTMLDetailsElement).open);
  };
  const openSheet = (): void => {
    sheet.hidden = false;
    fillSheet(linesAt(replay.at));
    document.getElementById("sheetClose")!.focus();
  };
  const closeSheet = (): void => {
    sheet.hidden = true;
    document.getElementById("more")!.focus();
  };
  document.getElementById("more")!.onclick = openSheet;
  document.getElementById("sheetClose")!.onclick = closeSheet;
  document.getElementById("sheetBack")!.onclick = () => moved(replay.at - 1);
  document.getElementById("sheetFwd")!.onclick = () => moved(replay.at + 1);
  sheet.onclick = (e) => {
    if (e.target === sheet) closeSheet();
  };
  // Взгляд меняет ВСЁ: чья рука своя, чьи карты видно, чьи права. Проще открыть запись заново тем же
  // мгновением, чем пересобирать экран на ходу.
  eyes.onchange = () => {
    location.search = new URLSearchParams({ ...Object.fromEntries(params), eyes: eyes.value, at: String(replay.at), mode, speed: String(speed) }).toString();
  };

  // МЕТКИ — важные мгновения партии (`replayMarks.ts`): на шкале, в списке «События» и в переходах
  // «к прошлому / следующему важному». Переход по метке ставит просмотр на паузу: к событию идут, чтобы
  // его разглядеть.
  const marks = marksOf(replay.moments.map((m) => m.deed), replay.start);
  const total = Math.max(1, replay.moments.length - 1);
  const jump = (step: number): void => {
    if (playing) stop();
    moved(step);
  };
  const marksBox = document.getElementById("marks")!;
  /** Теснее этой доли шкалы метки пальцем не различить — они собираются в группу. */
  const GAP = 22 / Math.max(200, marksBox.clientWidth || innerWidth - 44);
  const groups = clusters(marks, total, GAP);
  marksBox.innerHTML = groups
    .map((g, i) => {
      const left = `${((g[0]!.step / total) * 100).toFixed(2)}%`;
      if (g.length === 1) return `<button class="mark ${g[0]!.kind}" data-mark="${g[0]!.step}" style="left:${left}" aria-label="${esc(`${MARK_NAMES[g[0]!.kind]}: ${g[0]!.says}`)}"><i></i></button>`;
      return `<button class="mark group" data-group="${i}" style="left:${left}" aria-label="${g.length} событий рядом"><i>${g.length}</i></button>`;
    })
    .join("");
  for (const el of marksBox.querySelectorAll<HTMLElement>("[data-mark]")) el.onclick = () => jump(Number(el.dataset.mark));
  for (const el of marksBox.querySelectorAll<HTMLElement>("[data-group]")) el.onclick = () => openEvents(groups[Number(el.dataset.group)]!);
  document.getElementById("prevMark")!.onclick = () => { const m = markNear(marks, replay.at, -1); if (m) jump(m.step); };
  document.getElementById("nextMark")!.onclick = () => { const m = markNear(marks, replay.at, 1); if (m) jump(m.step); };

  // СОБЫТИЯ — крупный список, время и что случилось. Тап — к событию, на паузе, и список закрывается.
  const events = document.getElementById("events")!;
  const eventsBody = document.getElementById("eventsBody")!;
  const eventsTitle = document.getElementById("eventsTitle")!;
  const openEvents = (list: readonly Mark[] = marks): void => {
    eventsTitle.textContent = list === marks ? `События партии · ${marks.length}` : `${list.length} событий рядом`;
    eventsBody.innerHTML = list.length === 0
      ? `<div class="line">Важных событий в записи нет: раздачи, закрытия и сбора круга, конца партии стол не записал.</div>`
      : list.map((m) => `<button class="ev${m.step === replay.at ? " now" : ""}" data-step="${m.step}"><time>${clockText(m.at - t0)}</time><b class="kind-${m.kind}">${MARK_NAMES[m.kind]}</b><span>${esc(m.says)}</span></button>`).join("");
    for (const el of eventsBody.querySelectorAll<HTMLElement>("[data-step]")) el.onclick = () => { events.hidden = true; jump(Number(el.dataset.step)); };
    events.hidden = false;
    document.getElementById("eventsClose")!.focus();
  };
  document.getElementById("eventsOpen")!.onclick = () => openEvents();
  document.getElementById("eventsClose")!.onclick = () => void (events.hidden = true);
  events.onclick = (e) => {
    if (e.target === events) events.hidden = true;
  };

  replay.onSeek(show);
  replay.seek(Number(params.get("at")) || 0);
  // КАДР ВСТАЁТ ПОЗЖЕ ПЕРВОГО ШАГА: экран подгоняет камеру под свой размер, когда дорисуется, — после
  // этого (и после поворота телефона) записанный взгляд ставится заново.
  const relook = (): void => {
    lastView = "";
    lookAsHe(replay.at);
  };
  void screen.ready.then(relook);
  addEventListener("resize", () => requestAnimationFrame(relook));


  // ПРОИГРЫВАНИЕ — в реальном времени записи или пошагово, на выбранной скорости (`replayClock.ts`).
  // Шаг считается от точки, где нажали «играть» (или сменили режим, скорость, перемотали), по
  // настенным часам — кадр браузера, пропущенный под нагрузкой, запись не сдвигает.
  let raf = 0;
  let head: ReturnType<typeof playhead> | null = null;
  const frame = (): void => {
    if (!head) return;
    const now = performance.now();
    const step = head.step(now);
    if (step !== replay.at) replay.seek(step);
    clock(head.recordAt(now));
    if (step >= replay.moments.length - 1 && head.recordAt(now) >= ats[ats.length - 1]!) return stop();
    raf = requestAnimationFrame(frame);
  };
  const anchor = (): void => {
    if (playing) head = playhead(ats, { step: replay.at, wall: performance.now() }, mode, speed);
  };
  function stop(): void {
    cancelAnimationFrame(raf);
    playing = false;
    head = null;
    playButton.textContent = "▶";
    clock(replay.moments[replay.at]!.at);
  }
  playButton.onclick = () => {
    if (playing) return stop();
    if (replay.at >= replay.moments.length - 1) replay.seek(0);
    playing = true;
    playButton.textContent = "❚❚";
    anchor();
    raf = requestAnimationFrame(frame);
  };
  modeSelect.onchange = () => {
    mode = modeSelect.value as ReplayMode;
    anchor();
  };
  speedSelect.onchange = () => {
    speed = Number(speedSelect.value);
    anchor();
  };
  // Перемотка руками во время игры — играет дальше уже оттуда.
  const moved = (to: number): void => {
    replay.seek(to);
    anchor();
  };
  bar.oninput = () => moved(Number(bar.value));
  document.getElementById("back")!.onclick = () => moved(replay.at - 1);
  document.getElementById("fwd")!.onclick = () => moved(replay.at + 1);

  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !events.hidden) return void (events.hidden = true);
    if (e.key === "Escape" && !sheet.hidden) return closeSheet();
    if (e.key === "ArrowRight") moved(replay.at + 1);
    if (e.key === "ArrowLeft") moved(replay.at - 1);
    if (e.key === " ") {
      e.preventDefault();
      playButton.click();
    }
  });
}

void start().catch((err: unknown) => say(err instanceof Error ? err.message : String(err)));
