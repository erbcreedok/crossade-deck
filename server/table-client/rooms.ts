// МОИ КОМНАТЫ — с этого начинается и мини-апп без ссылки на стол (кнопка меню бота, ярлык), и приложение
// Crossade. Вид — хаба (`design/rooms`, `design/hubhome`): сукно с трилистниками, пиксельный шрифт, деревянные
// плашки с золотом. Сверху — я: кружок и имя, по тапу — ПРОФИЛЬ (кем сижу за столом: кукла, расцветка, свой
// цвет; «Привязать Telegram» у гостя приложения).
//
// Кого показывать, решает стол (`GET /table/my`, `mine.ts`) по подписи Telegram или ключу приложения.
// Страница лишь рисует: живые комнаты с основаниями, закрытые — отдельно и только ради записей.
//
// ЯРЛЫК НА ДОМАШНИЙ ЭКРАН — `addToHomeScreen` (Bot API 8.0). Кнопка есть, пока Telegram не сказал
// «не умею» или «уже добавлен»: на iPhone статус всегда приходит `unknown`, и прятать кнопку по нему
// значило бы спрятать её там, где добавление работает. Ярлык открывает мини-апп без параметра — сюда же.

import { FAVOURITE_INKS as INKS, PALETTE } from "../../look/src/palette.js";
import { DOLLS, MAIN_PALETTES, PALETTES, type Doll } from "../src/table/dolls.js";
import { nativeShell } from "./arNative.js";
import { DOLL_SIZE } from "./bodyView.js";
import { ART, EXTEND, dollSprite } from "./dollSprites.js";
import { mountGround } from "./ground.js";
import { HOST } from "./host.js";

interface TelegramApp {
  initData?: string;
  isVersionAtLeast?(v: string): boolean;
  addToHomeScreen?(): void;
  checkHomeScreenStatus?(cb?: (status: string) => void): void;
  onEvent?(name: string, fn: (e?: unknown) => void): void;
}

interface MyRoom {
  room: string;
  title: string;
  kind: string;
  why: ("owner" | "admin" | "visited" | "chat")[];
  chat: string | null;
  now: string[];
  lastAt: number;
}
interface MyClosed {
  room: string;
  title: string;
  lastAt: number;
  replay?: { pass: string; from: number; to: number | null };
}
/** Профиль стола (`GET /table/profile`). */
interface Profile {
  name: string;
  photo?: string;
  telegram: boolean;
  doll: Doll;
  palette: number;
  color: string;
  chosen: boolean;
}

const WHY: Record<MyRoom["why"][number], string> = { owner: "создал", admin: "распорядитель", visited: "был", chat: "из чата" };
const DOLL_NAME: Record<Doll, string> = { king: "Король", queen: "Дама" };

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const when = (at: number): string => new Date(at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const P = PALETTE;
const CSS = `
[data-rooms]{position:fixed;inset:0;z-index:900;overflow:hidden;color:${P.ink};font:400 13px/1.4 Tiny5,monospace}
[data-rooms] .scroll{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;
  padding:calc(64px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px)) 14px calc(96px + env(safe-area-inset-bottom));box-sizing:border-box}
[data-rooms] .wrap{max-width:520px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
[data-rooms] .bar{position:absolute;left:0;right:0;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:calc(10px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px)) 14px 10px;background:rgba(11,7,4,.42);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)}
[data-rooms] .brand{font:400 20px Tiny5,monospace;color:${P.gold};letter-spacing:1px}
[data-rooms] .me{display:flex;align-items:center;gap:8px;border:0;background:none;color:${P.ink};font:inherit;cursor:pointer;padding:0;min-width:0}
[data-rooms] .me .who{display:flex;flex-direction:column;align-items:flex-end;min-width:0}
[data-rooms] .me .nm{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px}
[data-rooms] .me .note{font-size:10px;color:${P.inkDim}}
[data-rooms] .ball{flex:none;border-radius:50%;background:${P.well};display:flex;align-items:center;justify-content:center;overflow:hidden;color:${P.ink}}
[data-rooms] h2{margin:8px 0 0;font:400 11px Tiny5,monospace;letter-spacing:1px;color:${P.inkDim};text-transform:uppercase}
[data-rooms] .card{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:12px;background:linear-gradient(${P.panel},${P.well});
  box-shadow:inset 0 0 0 3px ${P.black},inset 0 0 0 5px ${P.wood},0 4px 0 rgba(11,7,4,.5)}
[data-rooms] .card.hot{box-shadow:inset 0 0 0 3px ${P.black},inset 0 0 0 5px ${P.gold},0 4px 0 rgba(11,7,4,.5)}
[data-rooms] .card .title{font-size:16px;color:${P.gold};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-rooms] .meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px;color:${P.inkDim}}
[data-rooms] .tag{padding:2px 7px;border-radius:6px;background:${P.black};color:${P.gold};box-shadow:inset 0 0 0 1.5px ${P.wood}}
[data-rooms] .acts{display:flex;gap:8px;align-items:center}
[data-rooms] .btn{font:400 12px Tiny5,monospace;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;color:${P.ink};background:${P.well};box-shadow:inset 0 0 0 2px ${P.wood};text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
[data-rooms] .btn.gold{color:#1a0f06;background:linear-gradient(${P.goldLight},${P.goldDark});box-shadow:inset 0 0 0 2px ${P.black},0 3px 0 ${P.black}}
[data-rooms] .btn:active{transform:translateY(1px)}
[data-rooms] .btn:focus-visible,[data-rooms] .me:focus-visible{outline:2px solid ${P.gold};outline-offset:2px}
[data-rooms] .empty{padding:20px 16px;border-radius:12px;background:rgba(11,7,4,.35);box-shadow:inset 0 0 0 2px ${P.wood};color:${P.inkDim};text-align:center;font-size:12px}
[data-rooms] .bad{color:${P.danger}}
[data-rooms] .dock{position:absolute;left:0;right:0;bottom:0;z-index:2;display:flex;gap:10px;justify-content:center;padding:12px 14px calc(12px + env(safe-area-inset-bottom));
  background:linear-gradient(rgba(11,7,4,0),rgba(11,7,4,.75))}
[data-rooms] .dock .btn{min-height:44px;padding:0 18px;font-size:13px}
[data-rooms] .lead{font-size:12px;color:${P.inkDim}}
/* ПРОФИЛЬ — лист снизу, как в хабе (design/hubhome). */
[data-rooms] .veil{position:absolute;inset:0;z-index:5;background:rgba(11,7,4,.55)}
[data-rooms] .sheet{position:absolute;left:0;right:0;bottom:0;z-index:6;max-height:92%;overflow-y:auto;padding:14px 16px calc(18px + env(safe-area-inset-bottom));
  background:${P.felt};border-radius:22px 22px 0 0;box-shadow:inset 0 0 0 3px ${P.black},inset 0 0 0 5px ${P.panel},0 -6px 16px rgba(0,0,0,.35);box-sizing:border-box}
[data-rooms] .sheet .top{display:flex;justify-content:space-between;align-items:center}
[data-rooms] .sheet h3{margin:0;font:400 16px Tiny5,monospace;color:${P.gold};letter-spacing:1px}
[data-rooms] .sheet .row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:2px solid ${P.black}}
[data-rooms] .sheet .col{flex-direction:column;align-items:stretch}
[data-rooms] .sheet .label{color:${P.inkDim};font-size:12px}
[data-rooms] .opts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
[data-rooms] .btn.on{color:#1a0f06;background:linear-gradient(${P.goldLight},${P.goldDark});box-shadow:inset 0 0 0 2px ${P.black},0 3px 0 ${P.black}}
[data-rooms] .chip{width:40px;height:28px;border-radius:8px;border:0;cursor:pointer;display:flex;gap:2px;align-items:center;justify-content:center;background:${P.well};box-shadow:inset 0 0 0 2px ${P.wood}}
[data-rooms] .chip.on{box-shadow:inset 0 0 0 2px ${P.black},0 0 0 2px ${P.ink}}
[data-rooms] .chip i{width:8px;height:15px;border-radius:2px;display:block}
[data-rooms] .dot{width:28px;height:28px;border-radius:50%;border:0;cursor:pointer;box-shadow:inset 0 0 0 2px ${P.black}}
[data-rooms] .dot.on{box-shadow:inset 0 0 0 2px ${P.black},0 0 0 3px ${P.ink}}
[data-rooms] .doll{position:relative;height:210px;margin:6px -16px 0;overflow:hidden}
[data-rooms] .doll img{position:absolute;pointer-events:none}
[data-rooms] .doll .edge{position:absolute;left:0;right:0;bottom:0;height:30px;background:linear-gradient(${P.wood},${P.panel});box-shadow:inset 0 3px 0 ${P.black}}
`;

/** Адрес стола — соседний с этой страницей: под реле `/t/?room=…`, на маке `/table/?room=…`. */
const tableUrl = (room: string): string => `?room=${encodeURIComponent(room)}&from=rooms${appKey() ? `&key=${encodeURIComponent(appKey()!)}` : ""}`;
/** Ключ приложения Crossade из адреса (`appPass.ts`) — там, где нет подписи Telegram. */
const appKey = (): string | null => new URLSearchParams(location.search).get("key");
const replayUrl = (room: string, r: NonNullable<MyClosed["replay"]>): string =>
  `replay?${new URLSearchParams({ room, pass: r.pass, from: String(r.from), ...(r.to === null ? {} : { to: String(r.to) }) })}`;

/** Кто назван ключом приложения — для подписи; ключ подписан сервером, здесь его только читают. */
const keyName = (key: string): { name: string; guest: boolean } | null => {
  try {
    const bytes = Uint8Array.from(atob(key.split(".")[0]!.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const who = JSON.parse(new TextDecoder().decode(bytes)) as { key?: string; name?: string };
    return who.name ? { name: who.name, guest: who.key?.startsWith("dev:") === true } : null;
  } catch {
    return null;
  }
};

/** Кружок: фото или первая буква, в кольце моего цвета. */
const ball = (name: string, photo: string | undefined, ink: string, size: number): string =>
  `<span class="ball" style="width:${size}px;height:${size}px;box-shadow:inset 0 0 0 2px ${P.black},0 0 0 2px ${ink};font-size:${Math.round(size * 0.46)}px">`
  + (photo ? `<img src="${esc(photo)}" alt="" style="width:100%;height:100%;object-fit:cover">` : esc([...name.trim()][0]?.toUpperCase() ?? "?"))
  + `</span>`;

export function mountRooms(host: HTMLElement, app: TelegramApp | undefined): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  const page = document.createElement("div");
  page.dataset.rooms = "";
  host.append(page);
  mountGround(page);
  const bar = document.createElement("div");
  bar.className = "bar";
  const scroll = document.createElement("div");
  scroll.className = "scroll";
  scroll.dataset.scroll = "";
  const dock = document.createElement("div");
  dock.className = "dock";
  const layer = document.createElement("div");
  page.append(scroll, bar, dock, layer);
  document.title = "Мои комнаты";

  const signed = app?.initData ?? "";
  const key = appKey();
  const native = nativeShell();
  /** Кто спрашивает стол: подпись Telegram или ключ приложения. */
  const auth: Record<string, string> = signed ? { "x-telegram-init-data": signed } : key ? { "x-crossade-app-key": key } : {};

  // ── Я — сверху справа: кружок и имя; по тапу — профиль. ──────────────────────────────────────────
  let profile: Profile | null = null;
  const me = key ? keyName(key) : null;
  const drawBar = () => {
    const name = profile?.name ?? me?.name ?? "";
    const note = profile ? (profile.telegram ? "Telegram" : "гость") : me?.guest ? "гость" : "";
    bar.innerHTML = `<span class="brand">Crossade</span>`
      + (signed || key ? `<button class="me" data-me><span class="who"><span class="nm">${esc(name || "Профиль")}</span>${note ? `<span class="note">${note}</span>` : ""}</span>${ball(name || "?", profile?.photo, profile?.color ?? P.gold, 34)}</button>` : "");
    bar.querySelector<HTMLElement>("[data-me]")?.addEventListener("click", () => openProfile());
  };
  drawBar();

  // ── ЯРЛЫК: кнопка, пока Telegram не сказал, что не умеет или уже добавлено. ─────────────────────────
  let homeState: "hidden" | "offer" | "added" = app?.isVersionAtLeast?.("8.0") && app.addToHomeScreen ? "offer" : "hidden";
  const drawDock = () => {
    dock.innerHTML = (key ? `<button class="btn gold" data-new>＋ Новый стол</button>` : "")
      + (homeState === "offer" ? `<button class="btn" data-add-home>＋ Ярлык</button>` : "");
    dock.querySelector<HTMLElement>("[data-add-home]")?.addEventListener("click", () => app?.addToHomeScreen?.());
    const make = dock.querySelector<HTMLElement>("[data-new]");
    if (make && key) {
      make.onclick = () => {
        make.textContent = "Открываю стол…";
        void fetch(`${HOST}/table/app/rooms`, { method: "POST", headers: { "content-type": "application/json", "x-crossade-app-key": key }, body: "{}" })
          .then(async (res) => {
            if (!res.ok) throw new Error(String(res.status));
            location.href = tableUrl(((await res.json()) as { room: string }).room);
          })
          .catch(() => { make.textContent = "Стол не открылся — ещё раз"; });
      };
    }
  };
  app?.onEvent?.("homeScreenChecked", (e) => {
    const status = (e as { status?: string } | undefined)?.status;
    if (status === "unsupported") homeState = "hidden";
    else if (status === "added") homeState = "added";
    drawDock();
  });
  app?.onEvent?.("homeScreenAdded", () => { homeState = "added"; drawDock(); });
  if (homeState === "offer") app?.checkHomeScreenStatus?.();
  drawDock();

  const body = (html: string): void => {
    scroll.innerHTML = `<div class="wrap">${html}</div>`;
    for (const el of scroll.querySelectorAll<HTMLElement>("[data-room]")) el.onclick = () => void (location.href = tableUrl(el.dataset.room!));
    if (native) wireLogin(scroll, native, key);
  };

  body(`<div class="empty">Спрашиваю стол…</div>`);
  // ПРИЛОЖЕНИЕ БЕЗ КЛЮЧА — ВХОД: гостем сразу или тем же человеком, что в Telegram.
  if (!signed && !key && native) {
    return body(`<h2>Вход</h2><div class="card"><span class="lead">Гость живёт на этом телефоне. Через Telegram — ты тот же, что в мини-аппе, со своими столами.</span>`
      + `<div class="acts"><button class="btn gold" data-guest>Играть гостем</button><button class="btn" data-tg-login>Войти через Telegram</button></div></div>`);
  }
  if (!signed && !key) return body(`<div class="empty">Открой эту страницу из Telegram — кнопкой меню бота: без Telegram стол не знает, кто ты.</div>`);

  void fetch(`${HOST}/table/profile`, { headers: auth })
    .then(async (res) => { if (res.ok) { profile = (await res.json()) as Profile; drawBar(); } })
    .catch(() => {});

  void fetch(`${HOST}/table/my`, { headers: auth })
    .then(async (res) => {
      if (!res.ok) throw new Error(res.status === 401 ? (signed ? "Telegram не подтвердил, кто ты. Закрой и открой мини-апп заново." : "Ключ приложения устарел — возьми новый у бота: /app в личке.") : `Стол ответил ${res.status}.`);
      const { rooms, closed } = (await res.json()) as { rooms: MyRoom[]; closed: MyClosed[] };
      const card = (r: MyRoom) => {
        const tags = r.why.map((w) => `<span class="tag">${WHY[w]}${w === "chat" && r.chat ? ` «${esc(r.chat)}»` : ""}</span>`).join("");
        const who = r.now.length ? `за столом: ${esc(r.now.join(", "))}` : "за столом никого";
        return `<div class="card${r.now.length ? " hot" : ""}"><span class="title">${esc(r.title)}</span><span class="meta">${tags}<span>${who}</span></span>`
          + `<span class="acts"><button class="btn gold" data-room="${esc(r.room)}">${r.why.includes("visited") ? "Вернуться" : "Войти"}</button></span></div>`;
      };
      const mine = rooms.filter((r) => !r.why.includes("chat") || r.why.length > 1);
      const chats = rooms.filter((r) => r.why.length === 1 && r.why[0] === "chat");
      const live = rooms.length
        ? (mine.length ? `<h2>Твои столы</h2>${mine.map(card).join("")}` : "") + (chats.length ? `<h2>Из твоих чатов</h2>${chats.map(card).join("")}` : "")
        : `<div class="empty">${key ? "Пока ни одного стола — открой свой: «Новый стол»." : "Пока ни одного стола. Открой стол в чате с ботом командой /table — он появится здесь."}</div>`;
      const gone = closed.length
        ? `<h2>Закрытые — только записи</h2>${closed.map((c) => `<div class="card"><span class="title" style="color:${P.inkDim}">${esc(c.title)}</span><span class="meta">${when(c.lastAt)}</span>`
          + (c.replay ? `<span class="acts"><a class="btn" href="${esc(replayUrl(c.room, c.replay))}">Запись</a></span>` : "") + `</div>`).join("")}`
        : "";
      body(live + gone);
    })
    .catch((err: unknown) => body(`<div class="empty bad">${esc(err instanceof Error ? err.message : "Стол не отвечает.")}</div>`));

  // ── ПРОФИЛЬ: кем сижу за столом и мой цвет. Каждый выбор — сразу в профиль стола. ────────────────────
  let more = false;
  function openProfile(): void {
    if (!profile) return;
    const p = profile;
    const save = (patch: Partial<Pick<Profile, "doll" | "palette" | "color">>) => {
      Object.assign(p, patch);
      draw();
      drawBar();
      void fetch(`${HOST}/table/profile`, { method: "PATCH", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify(patch) })
        .then(async (res) => { if (res.ok) { Object.assign(p, (await res.json()) as Profile); drawBar(); } })
        .catch(() => {});
    };
    const draw = () => {
      const pals = PALETTES.map((pal, k) => ({ pal, k })).filter(({ k }) => more || k < MAIN_PALETTES || k === p.palette);
      layer.innerHTML = `<div class="veil" data-close></div><div class="sheet" data-profile>`
        + `<div class="top"><h3>ПРОФИЛЬ</h3><button class="btn" data-close>Закрыть</button></div>`
        + `<div class="doll" data-doll-preview>${dollPreview(p)}<div class="edge"></div></div>`
        + `<div class="row"><span class="label">Имя</span><span>${esc(p.name)}</span></div>`
        + `<div class="row"><span class="label">Кукла</span><span class="opts">${DOLLS.map((d) => `<button class="btn${p.doll === d ? " on" : ""}" data-doll="${d}">${DOLL_NAME[d]}</button>`).join("")}</span></div>`
        + `<div class="row col"><span class="label">Расцветка — чтобы одинаковые куклы за столом не сливались</span><span class="opts" style="justify-content:flex-start;margin-top:8px">`
        + pals.map(({ pal, k }) => `<button class="chip${p.palette === k ? " on" : ""}" data-pal="${k}" title="${esc(pal.name)}"><i style="background:${pal.red}"></i><i style="background:${pal.blue}"></i><i style="background:${pal.gold}"></i></button>`).join("")
        + `<button class="btn" data-more>${more ? "меньше" : `ещё ${PALETTES.length - MAIN_PALETTES}`}</button></span></div>`
        + `<div class="row col"><span class="label">Мой цвет — обводка куклы, ниточка и табличка за столом</span><span class="opts" style="justify-content:space-between;margin-top:8px">`
        + INKS.map((c) => `<button class="dot${p.color === c ? " on" : ""}" data-ink="${c}" style="background:${c}"></button>`).join("") + `</span></div>`
        + `<div class="row"><span class="label">Telegram</span>${p.telegram ? `<span style="color:${P.gold}">привязан</span>` : native ? `<button class="btn gold" data-tg-link>Привязать</button>` : `<span class="lead">вход через бота</span>`}</div>`
        + `</div>`;
      for (const el of layer.querySelectorAll<HTMLElement>("[data-close]")) el.onclick = () => { layer.innerHTML = ""; };
      for (const el of layer.querySelectorAll<HTMLElement>("[data-doll]")) el.onclick = () => save({ doll: el.dataset.doll as Doll });
      for (const el of layer.querySelectorAll<HTMLElement>("[data-pal]")) el.onclick = () => {
        // РАСЦВЕТКА ПРИВОДИТ СВОЙ ЦВЕТ: обводка встаёт предпочитаемой для неё; поменять её можно ниже, отдельно.
        const k = Number(el.dataset.pal);
        save({ palette: k, color: PALETTES[k]!.ink });
      };
      for (const el of layer.querySelectorAll<HTMLElement>("[data-ink]")) el.onclick = () => save({ color: el.dataset.ink! });
      layer.querySelector<HTMLElement>("[data-more]")!.onclick = () => { more = !more; draw(); };
      // ПРИВЯЗАТЬ TELEGRAM — окно входа приложения; ключ гостя едет с ним, и выбор в профиле переезжает.
      layer.querySelector<HTMLElement>("[data-tg-link]")?.addEventListener("click", () => native?.login?.(key ?? undefined));
    };
    draw();
  }

  /** Кукла крупно, как её увидят за столом: туловище за кромкой, голова над воротом, обводка моим цветом. */
  function dollPreview(p: Profile): string {
    const ready = () => { const el = layer.querySelector("[data-doll-preview]"); if (el) el.innerHTML = dollPreview(p) + `<div class="edge"></div>`; };
    const torso = dollSprite(p.doll, p.palette, "body", p.color, HOST, ready);
    const head = dollSprite(p.doll, p.palette, "head", p.color, HOST, ready);
    const torsoBack = dollSprite(p.doll, p.palette, "bodyBack", p.color, HOST, ready);
    const headBack = dollSprite(p.doll, p.palette, "headBack", p.color, HOST, ready);
    if (!torso || !head || !torsoBack || !headBack) return `<span class="lead" style="position:absolute;left:0;right:0;top:90px;text-align:center">кукла печётся…</span>`;
    // Та же мера, что за столом (`DOLL_SIZE`): плечи на высоте 4 над кромкой, голова пришита к вороту.
    const art = ART[p.doll];
    const unit = 26, edge = 210 - 30;
    const tw = DOLL_SIZE.torso * unit, th = ((tw * torso.h) / torso.w) * DOLL_SIZE.stretch;
    const shoulderY = edge - 4 * unit;
    const py = art.shoulder / (1 + EXTEND);
    const hw = DOLL_SIZE.head * unit, hh = (hw * head.h) / head.w;
    const headY = shoulderY - ((hh / unit) * 0.45 + 0.2) * unit;
    queueMicrotask(() => alive(art.looks, unit));
    return `<img data-part="torso" data-front="${torso.src}" data-back="${torsoBack.src}" src="${torso.src}" alt="" style="left:calc(50% - ${tw / 2}px);top:${shoulderY - th * py}px;width:${tw}px;height:${th}px">`
      + `<img data-part="head" data-front="${head.src}" data-back="${headBack.src}" src="${head.src}" alt="" style="left:calc(50% - ${hw / 2}px);top:${headY - hh / 2}px;width:${hw}px;height:${hh}px">`;
  }

  /**
   * КУКЛА ЖИВАЯ, как на стенде (`design/persona`, вид «профиль»): дышит — плечи и голова чуть ходят вверх-вниз,
   * водит взглядом — голова смещается к тому, куда смотрит, и поворачивается лицом туда. Кадр за кадром,
   * пока превью на странице; кто просил меньше движения — стоит спокойно.
   * КРУТИТСЯ ПАЛЬЦЕМ: тянешь вбок — кукла поворачивается вокруг себя (картонка сужается), за четверть оборота —
   * спиной; где отпустил, там и стоит.
   */
  /** Куда кукла повёрнута — переживает перерисовку листа (сменил расцветку — стоит, как стояла). */
  let spun = 0;
  function alive(looks: -1 | 1, unit: number): void {
    const box = layer.querySelector<HTMLElement>("[data-doll-preview]");
    if (!box || box.dataset.alive) return;
    box.dataset.alive = "1";
    let turn = spun;
    let from: number | null = null;
    box.style.touchAction = "none";
    box.addEventListener("pointerdown", (e) => { from = e.clientX; box.setPointerCapture(e.pointerId); });
    box.addEventListener("pointermove", (e) => {
      if (from === null) return;
      turn += (e.clientX - from) * 0.9;
      spun = turn;
      from = e.clientX;
      if (still) tick(performance.now());
    });
    const up = () => { from = null; };
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    const tick = (now: number) => {
      const torso = box.querySelector<HTMLElement>('[data-part="torso"]'), head = box.querySelector<HTMLElement>('[data-part="head"]');
      if (!box.isConnected || !torso || !head) return;
      const t = still ? 0 : (now - t0) / 1000;
      const breath = Math.sin((t * 2 * Math.PI) / 3.2);
      const gx = Math.sin(t * 0.8) * 5, toward = gx / Math.hypot(gx, 8);
      const c = Math.cos((turn * Math.PI) / 180), back = c < 0, w = Math.max(0.06, Math.abs(c));
      const flip = back ? 1 : (looks < 0) === toward > 0 ? -1 : 1;
      for (const [img, want] of [[torso, back], [head, back]] as const) {
        const src = want ? img.dataset.back! : img.dataset.front!;
        if (img.getAttribute("src") !== src) img.src = src;
      }
      torso.style.transform = `translateY(${(-breath * 0.08 * unit).toFixed(2)}px) scaleX(${w.toFixed(3)})`;
      head.style.transform = `translate(${(toward * 0.4 * unit * c).toFixed(2)}px,${(-breath * 0.13 * unit).toFixed(2)}px) scaleX(${(flip * w).toFixed(3)})`;
      box.dataset.turn = String(Math.round(turn));
      box.dataset.back = back ? "1" : "0";
      if (!still) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

/** Кнопки входа: гость — ключ у стола сразу; Telegram — окно входа приложения (`native/ios-table`). */
function wireLogin(page: HTMLElement, shell: NonNullable<ReturnType<typeof nativeShell>>, key: string | null): void {
  const guest = page.querySelector<HTMLElement>("[data-guest]");
  if (guest) {
    guest.onclick = () => {
      guest.textContent = "Сажаю гостя…";
      void fetch(`${HOST}/table/app/guest`, { method: "POST" })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const { key } = (await res.json()) as { key: string };
          shell.key?.(key);
          location.href = `?rooms&key=${encodeURIComponent(key)}`;
        })
        .catch(() => { guest.textContent = "Стол не отвечает — ещё раз"; });
    };
  }
  for (const el of page.querySelectorAll<HTMLElement>("[data-tg-login]")) el.onclick = () => shell.login?.(key ?? undefined);
}
