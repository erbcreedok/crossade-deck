// МОИ КОМНАТЫ — с этого мини-апп начинается, когда его открыли без ссылки на стол: кнопкой меню бота,
// ярлыком на домашнем экране, из профиля бота. Прямая ссылка на стол сюда не заходит — она ведёт в стол.
//
// Кого показывать, решает стол (`GET /table/my`, `mine.ts`) по подписи Telegram. Страница лишь рисует:
// живые комнаты с основаниями, закрытые — отдельно и только ради записей.
//
// ЯРЛЫК НА ДОМАШНИЙ ЭКРАН — `addToHomeScreen` (Bot API 8.0). Кнопка есть, пока Telegram не сказал
// «не умею» или «уже добавлен»: на iPhone статус всегда приходит `unknown`, и прятать кнопку по нему
// значило бы спрятать её там, где добавление работает. Ярлык открывает мини-апп без параметра — сюда же.

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

const WHY: Record<MyRoom["why"][number], string> = { owner: "создал", admin: "распорядитель", visited: "был", chat: "из чата" };

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const when = (at: number): string => new Date(at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const CSS = `
[data-rooms]{position:fixed;inset:0;z-index:900;overflow-y:auto;-webkit-overflow-scrolling:touch;background:#10170f;color:#f5ead0;font:15px/1.45 system-ui,sans-serif;
  padding:calc(16px + var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px)) 16px calc(24px + env(safe-area-inset-bottom));box-sizing:border-box}
[data-rooms] .wrap{max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
[data-rooms] h1{font-size:22px;margin:0;font-weight:650;letter-spacing:.2px}
[data-rooms] .sub{color:#cdb98f;font-size:13.5px;margin:-8px 0 0}
[data-rooms] h2{font-size:13px;letter-spacing:.8px;text-transform:uppercase;color:#cdb98f;margin:10px 0 0;font-weight:600}
[data-rooms] .room{display:flex;flex-direction:column;gap:6px;text-align:left;width:100%;padding:14px 16px;min-height:64px;border-radius:14px;border:1px solid #3b3222;
  background:linear-gradient(#25321f,#16210f);color:inherit;font:inherit;cursor:pointer;box-shadow:inset 0 0 0 1px #0b0704}
[data-rooms] .room:active{transform:scale(.99)}
[data-rooms] .room:focus-visible,[data-rooms] button:focus-visible{outline:2px solid #f0c86a;outline-offset:2px}
[data-rooms] .name{font-size:17px;font-weight:600}
[data-rooms] .meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px;color:#cdb98f}
[data-rooms] .tag{padding:2px 8px;border-radius:999px;background:#0b0704;color:#f0c86a;border:1px solid #6b4d2c}
[data-rooms] .closed{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;background:#15130f;border:1px solid #2c2519}
[data-rooms] .closed .name{font-size:15px;font-weight:500;color:#cdb98f;flex:1;min-width:0}
[data-rooms] .closed a{flex:none;color:#0b0704;background:#f0c86a;border-radius:9px;padding:9px 12px;text-decoration:none;font-size:13.5px;font-weight:600}
[data-rooms] .empty{padding:22px 16px;border-radius:14px;border:1px dashed #6b4d2c;color:#cdb98f;text-align:center}
[data-rooms] .home{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:12px;border:1px solid #6b4d2c;background:#1c120b;color:#f0c86a;font:600 15px system-ui;cursor:pointer}
[data-rooms] .bad{color:#e8836f}
`;

/** Адрес стола — соседний с этой страницей: под реле `/t/?room=…`, на маке `/table/?room=…`. */
const tableUrl = (room: string): string => `?room=${encodeURIComponent(room)}&from=rooms${appKey() ? `&key=${encodeURIComponent(appKey()!)}` : ""}`;
/** Ключ приложения Crossade из адреса (`appPass.ts`) — там, где нет подписи Telegram. */
const appKey = (): string | null => new URLSearchParams(location.search).get("key");
const replayUrl = (room: string, r: NonNullable<MyClosed["replay"]>): string =>
  `replay?${new URLSearchParams({ room, pass: r.pass, from: String(r.from), ...(r.to === null ? {} : { to: String(r.to) }) })}`;

export function mountRooms(host: HTMLElement, app: TelegramApp | undefined): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  const page = document.createElement("div");
  page.dataset.rooms = "";
  page.dataset.scroll = "";
  host.append(page);
  document.title = "Мои комнаты";

  const shell = (body: string): void => {
    page.innerHTML = `<div class="wrap"><h1>Мои комнаты</h1><p class="sub">Столы, которые ты открыл, где ты распорядитель или уже сидел, и столы твоих чатов.</p>${homeButton()}${body}</div>`;
    const add = page.querySelector<HTMLElement>("[data-add-home]");
    if (add) add.onclick = () => app?.addToHomeScreen?.();
    for (const el of page.querySelectorAll<HTMLElement>("[data-room]")) el.onclick = () => void (location.href = tableUrl(el.dataset.room!));
  };

  // ЯРЛЫК: кнопка, пока Telegram не сказал, что не умеет или уже добавлено.
  let home: "hidden" | "offer" | "added" = app?.isVersionAtLeast?.("8.0") && app.addToHomeScreen ? "offer" : "hidden";
  const homeButton = (): string =>
    home === "offer" ? `<button class="home" data-add-home>＋ Ярлык на главный экран</button>` : "";
  let last = "";
  const redraw = () => shell(last);
  app?.onEvent?.("homeScreenChecked", (e) => {
    const status = (e as { status?: string } | undefined)?.status;
    if (status === "unsupported") home = "hidden";
    else if (status === "added") home = "added";
    redraw();
  });
  app?.onEvent?.("homeScreenAdded", () => {
    home = "added";
    redraw();
  });
  if (home === "offer") app?.checkHomeScreenStatus?.();

  shell(`<div class="empty">Спрашиваю стол…</div>`);
  const signed = app?.initData ?? "";
  const key = appKey();
  if (!signed && !key) {
    last = `<div class="empty">Открой эту страницу из Telegram — кнопкой меню бота: без Telegram стол не знает, кто ты.</div>`;
    return redraw();
  }
  void fetch(`${HOST}/table/my`, { headers: signed ? { "x-telegram-init-data": signed } : { "x-crossade-app-key": key! } })
    .then(async (res) => {
      if (!res.ok) throw new Error(res.status === 401 ? (signed ? "Telegram не подтвердил, кто ты. Закрой и открой мини-апп заново." : "Ключ приложения устарел — возьми новый у бота: /app в личке.") : `Стол ответил ${res.status}.`);
      const { rooms, closed } = (await res.json()) as { rooms: MyRoom[]; closed: MyClosed[] };
      const live = rooms.length
        ? rooms
            .map((r) => {
              const tags = r.why.map((w) => `<span class="tag">${WHY[w]}${w === "chat" && r.chat ? ` «${esc(r.chat)}»` : ""}</span>`).join("");
              const who = r.now.length ? `за столом: ${esc(r.now.join(", "))}` : "за столом никого";
              return `<button class="room" data-room="${esc(r.room)}"><span class="name">${esc(r.title)}</span><span class="meta">${tags}<span>${who}</span></span></button>`;
            })
            .join("")
        : `<div class="empty">Пока ни одного стола. Открой стол в чате с ботом командой /table — он появится здесь.</div>`;
      const gone = closed.length
        ? `<h2>Закрытые — только записи</h2>${closed
            .map((c) => `<div class="closed" data-closed="${esc(c.room)}"><span class="name">${esc(c.title)} · ${when(c.lastAt)}</span>${c.replay ? `<a href="${esc(replayUrl(c.room, c.replay))}">Запись</a>` : ""}</div>`)
            .join("")}`
        : "";
      last = `<h2>Столы</h2>${live}${gone}`;
      redraw();
    })
    .catch((err: unknown) => {
      last = `<div class="empty bad">${esc(err instanceof Error ? err.message : "Стол не отвечает.")}</div>`;
      redraw();
    });
}
