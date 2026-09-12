// СТОЛЫ ЭТОЙ ИГРЫ: открыть свой, сесть за чужой, вернуться в свой.
//
// Экран стоит между плиткой и игрой, и появился он потому, что нажатие на плитку раньше молча
// открывало НОВЫЙ стол: сыграть с кем-то можно было, только переслав ссылку, а прийти на чужой
// открытый стол — никак.
//
// ТРИ ОСИ, А НЕ ОДИН ТУМБЛЕР. Кто ВИДИТ комнату и кого в неё ПУСКАЮТ — разные вопросы:
// «публичная, но по коду» и «скрытая, но по ссылке» существуют обе, и переключатель
// «приватная/публичная» делает половину случаев непредставимой.
//
// Разметка, а не холст, по той же причине, что и профиль: здесь ввод кода, список, который
// прокручивается, и текст, который умеет укорачиваться.

import { PALETTE, tint } from "@crossade/look";
import { closeRoom, findRooms, myRooms, openRoom, peekRoom, storedAccount, type Admission, type RoomCard, type Visibility } from "@crossade/wire";
import { askInWindow, type Ask } from "../home/ask.js";
import { buttonHtml, esc, FONT, labelHtml, lineHtml } from "../home/parts.js";

/** Откуда экран берёт столы и куда девает правки. Подменяется целиком — в тесте и в Mini App. */
export interface RoomsGateway {
  find(game: string): Promise<RoomCard[]>;
  mine(): Promise<RoomCard[]>;
  open(o: { game: string; visibility: Visibility; admission: Admission }): Promise<RoomCard | undefined>;
  peek(code: string): Promise<RoomCard | undefined>;
  close(room: string): Promise<boolean>;
  /** Кто я. Без аккаунта своих столов нет — и список своих не спрашивается вовсе. */
  me(): string | undefined;
}

export const liveRooms: RoomsGateway = {
  find: (game) => findRooms(game),
  async mine() {
    const id = storedAccount()?.id;
    return id ? myRooms(id) : [];
  },
  open: (o) => openRoom({ ...o, ...(storedAccount()?.id ? { by: storedAccount()!.id } : {}) }),
  peek: (code) => peekRoom(code),
  async close(room) {
    const id = storedAccount()?.id;
    return id ? closeRoom(room, id) : false;
  },
  me: () => storedAccount()?.id,
};

export interface TablesOptions {
  readonly gateway?: RoomsGateway | undefined;
  readonly ask?: Ask | undefined;
  /** Человек выбрал стол — его код. Открыть игру дело того, кто позвал. */
  readonly onSit: (game: string, code: string) => void;
}

export interface TablesScreen {
  readonly element: HTMLElement;
  /** Показать столы этой игры. Заголовок — её же имя, уже написанное по-русски. */
  show(game: string, label: string): Promise<void>;
  /** Сказать то, что по экрану не видно: «стол закрылся», «сервер молчит». */
  say(text: string): void;
  hide(): void;
  stop(): void;
}

const VIS: readonly { id: Visibility; text: string }[] = [
  { id: "public", text: "Всем" },
  { id: "friends", text: "Друзьям" },
  { id: "hidden", text: "Никому" },
];

const ADM: readonly { id: Admission; text: string }[] = [
  { id: "open", text: "Всех" },
  { id: "code", text: "По коду" },
  { id: "invite", text: "По приглашению" },
];

/** Переключатель из трёх положений. Выбранное — золотом: оно и есть ответ на вопрос слева. */
function switchHtml(name: string, options: readonly { id: string; text: string }[], chosen: string): string {
  return (
    `<div style="display:flex;gap:6px;flex-wrap:wrap">` +
    options
      .map((one) => {
        const on = one.id === chosen;
        return (
          `<button data-do="${name}:${one.id}" style="font:400 12px ${FONT};cursor:pointer;border:0;border-radius:7px;padding:7px 10px;` +
          (on
            ? `background:linear-gradient(${PALETTE.gold},${PALETTE.panelLight});color:${PALETTE.black};box-shadow:inset 0 0 0 2px ${PALETTE.black};`
            : `background:transparent;color:${PALETTE.inkDim};box-shadow:inset 0 0 0 2px ${PALETTE.panel};`) +
          `">${esc(one.text)}</button>`
        );
      })
      .join("") +
    `</div>`
  );
}

/** Строка стола: код крупно, сколько человек — рядом, действие — справа. */
function rowHtml(room: RoomCard, action: string, text: string, extra = ""): string {
  const people = room.players ?? 0;
  const note = people > 0 ? `${people} за столом` : "пусто";
  return (
    `<div style="display:flex;align-items:center;gap:10px;justify-content:space-between;padding:10px 0;` +
    `box-shadow:inset 0 3px 0 -1px ${tint(PALETTE.black, 0.55)}">` +
    `<div style="display:flex;align-items:center;gap:10px;min-width:0">` +
    `<span style="flex:none;font:400 15px 'Press Start 2P',monospace;color:${PALETTE.gold};background:${PALETTE.black};` +
    `box-shadow:inset 0 0 0 2px ${PALETTE.gold};border-radius:6px;padding:5px 8px">${esc(room.code ?? "—")}</span>` +
    `<span style="font:400 12px ${FONT};color:${PALETTE.inkDim};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(room.title ?? note)}</span>` +
    `</div><div style="display:flex;gap:8px;flex:none">${extra}${buttonHtml(`${action}:${room.code ?? ""}:${room.room}`, text, "plain", 8)}</div></div>`
  );
}

export function tablesScreen(container: HTMLElement, o: TablesOptions): TablesScreen {
  const gate = o.gateway ?? liveRooms;
  const ask = o.ask ?? askInWindow;

  let game = "";
  let label = "";
  let shown = false;
  let said = "";
  let visibility: Visibility = "public";
  let admission: Admission = "code";
  let open: RoomCard[] = [];
  let ours: RoomCard[] = [];
  let stopped = false;

  const element = document.createElement("div");
  element.className = "crossade-tables";
  element.style.cssText = "position:absolute;inset:0;z-index:11;pointer-events:none";
  container.appendChild(element);

  const listHtml = (title: string, rooms: readonly RoomCard[], empty: string, own: boolean): string =>
    `<div style="padding-top:14px">${labelHtml(title)}` +
    (rooms.length === 0
      ? `<div style="font:400 12px ${FONT};color:${PALETTE.inkDim};padding:10px 0">${esc(empty)}</div>`
      : rooms
          .map((room) =>
            own
              ? rowHtml(room, "sit", "Войти", buttonHtml(`shut::${room.room}`, "Закрыть", "quiet", 8))
              : rowHtml(room, "sit", "Сесть"),
          )
          .join("")) +
    `</div>`;

  const html = (): string => {
    if (!shown) return "";
    const body =
      `<div style="display:flex;flex-direction:column;padding:0 18px 22px">` +
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0 6px">` +
      `<span style="font:400 19px ${FONT};color:${PALETTE.ink}">${esc(label)}</span>` +
      buttonHtml("back", "Назад", "quiet", 8) +
      `</div>` +
      lineHtml(labelHtml("Стол видят") + switchHtml("vis", VIS, visibility), true) +
      lineHtml(labelHtml("Пускаем") + switchHtml("adm", ADM, admission), true) +
      `<div style="padding:14px 0 2px">${buttonHtml("create", "Открыть стол", "gold", 8)}</div>` +
      lineHtml(labelHtml("Знаю код") + buttonHtml("code", "Ввести код", "plain", 8), true) +
      listHtml("Открытые столы", open, "Пока никто не открыл стол — открой первый.", false) +
      (gate.me() ? listHtml("Мои столы", ours, "Своих столов пока нет.", true) : "") +
      (said ? `<div style="font:400 13px ${FONT};color:${PALETTE.gold};padding-top:12px;line-height:1.5">${esc(said)}</div>` : "") +
      `</div>`;
    return (
      `<div data-g="tables" style="position:absolute;inset:0;z-index:20;pointer-events:auto;display:flex;flex-direction:column;` +
      `justify-content:flex-end;background:${tint(PALETTE.black, 0.55)}">` +
      `<div style="background:${PALETTE.felt};box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.panel};` +
      `border-radius:18px 18px 0 0;max-height:86%;overflow:auto;padding-bottom:env(safe-area-inset-bottom, 0px)">${body}</div></div>`
    );
  };

  const draw = (): void => {
    if (stopped) return;
    element.innerHTML = html();
  };

  const reload = async (): Promise<void> => {
    const [found, own] = await Promise.all([gate.find(game), gate.me() ? gate.mine() : Promise.resolve([])]);
    if (stopped) return;
    open = found;
    ours = own.filter((one) => one.game === game);
    draw();
  };

  /** Сесть за стол по коду — но сперва спросив, жив ли он. Мёртвый код не должен молча уводить. */
  const sit = async (code: string): Promise<void> => {
    if (!code) return;
    const room = await gate.peek(code);
    if (stopped) return;
    if (!room) {
      said = "Стол закрылся. Открой новый или сядь за другой.";
      void reload();
      draw();
      return;
    }
    shown = false;
    said = "";
    draw();
    o.onSit(room.game, code);
  };

  const act = async (what: string): Promise<void> => {
    const [verb, code, room] = what.split(":");
    if (verb === "back") {
      shown = false;
      draw();
      return;
    }
    if (verb === "vis") {
      visibility = code as Visibility;
      draw();
      return;
    }
    if (verb === "adm") {
      admission = code as Admission;
      draw();
      return;
    }
    if (verb === "create") {
      const made = await gate.open({ game, visibility, admission });
      if (stopped) return;
      if (!made?.code) {
        said = "Не вышло открыть стол — сервер не ответил.";
        draw();
        return;
      }
      shown = false;
      said = "";
      draw();
      o.onSit(game, made.code);
      return;
    }
    if (verb === "code") {
      const typed = (await ask("Код стола", ""))?.trim();
      if (typed) await sit(typed);
      return;
    }
    if (verb === "sit") {
      await sit(code ?? "");
      return;
    }
    if (verb === "shut" && room) {
      said = (await gate.close(room)) ? "Стол закрыт. Его код снова свободен." : "Закрыть не вышло — это не твой стол.";
      await reload();
      draw();
    }
  };

  element.addEventListener("click", (e) => {
    const hit = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-do]");
    if (!hit) return;
    e.preventDefault();
    void act(hit.dataset["do"] ?? "");
  });

  return {
    element,
    async show(id, text) {
      game = id;
      label = text;
      shown = true;
      said = "";
      open = [];
      ours = [];
      draw();
      await reload();
    },
    say(text) {
      said = text;
      draw();
    },
    hide() {
      shown = false;
      draw();
    },
    stop() {
      stopped = true;
      element.remove();
    },
  };
}
