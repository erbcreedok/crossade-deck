// THE STRIP ALONG THE TOP OF A GAME — the way out, the game's name and its room, and who is at the
// table.
//
// TWO LEVELS, AND THIS IS THE UPPER ONE: markup over the glass, while the desk itself is the canvas
// under it. The lower HUD — hide, pin, lock — stays on the canvas, because that is pure mechanics
// for moving the game's own pieces; this is not. Text that has to shorten, a notch to step round
// and a list that opens are all things the document does for nothing and a renderer does by hand.
//
// IT BELONGS TO THE GAME, NOT TO A SHELF. The same strip stands in all four games and in a game
// opened at its own URL; a hub contributes the one fact only a hub knows — that there is a way out
// of here and where it leads (`TopHudState.exit`). Without one the strip is standalone's, and the
// name becomes the leftmost thing on it.

import { FAVOURITE_INKS, PALETTE } from "@crossade/look";
import { fitTitle, nameCap } from "./fit.js";
import { esc, ICON, svg } from "./icons.js";
import { topHudLook, type TopHudLook } from "./look.js";
import { fillCss, lineCss, plateCss, shadowCss, tint } from "./paint.js";
import { peopleRow, type TopHudPerson } from "./row.js";
import { roleWord, rosterList, type RosterRole, type TopHudMember } from "./roster.js";
import { roomSheetHtml, type TopHudRoom, type TopHudTable } from "./roomSheet.js";

/**
 * HOW FAR DOWN THE PAGE THE STRIP REACHES, as a custom property — so anything the page lays over a
 * game (a banner) can sit UNDER it without the page knowing the strip's height, the notch included.
 */
export const TOP_HUD_VAR = "--crossade-tophud";

/** One `<style>` for the document, however many strips are raised over its life. */
const SHEET_ID = "crossade-tophud";

/**
 * THE NOTCH IS STEPPED ROUND BY THE STRIP ITSELF, so no game has to know it has one: the band is
 * pushed down by the inset and keeps its own height under it.
 *
 * In a sheet rather than on the element, because `env()` is the one declaration that cannot survive
 * being written as an inline style everywhere it is read — including in the tests that check it.
 */
const CSS = `.crossade-tophud { padding-top: env(safe-area-inset-top, 0px); }`;

function installSheet(): void {
  if (document.getElementById(SHEET_ID)) return;
  const style = document.createElement("style");
  style.id = SHEET_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Fonts are the product's three, named where they are used rather than guessed at. */
const LETTER = "Tiny5, monospace";
const DIGIT = "'Press Start 2P', monospace";

/** There is a way out of here, and this is where it goes. Only a shelf ever knows it. */
export interface TopHudExit {
  /** The word, when the way out wears one. The look's own by default. */
  readonly word?: string | undefined;
  go(): void;
}

/** WHAT THE STRIP IS SAYING — data, all of it. The number of people is data too, never a knob. */
export interface TopHudState {
  /** The game's name, in the reader's language. The strip never asks where it came from. */
  readonly title: string;
  readonly room: string | undefined;
  readonly people: readonly TopHudPerson[];
  /**
   * ВСЯ КОМНАТА, А НЕ ТОЛЬКО ЛИЦА НА ПОЛОСЕ: зритель без стула и отошедший игрок тоже её люди.
   * Пусто — списку неоткуда это узнать, и он говорит за тех, кто сейчас за столом.
   */
  readonly roster: readonly TopHudMember[];
  readonly exit: TopHudExit | undefined;
  /**
   * САМ СТОЛ — сколько за ним стульев и можно ли поставить ещё. Это про МЕБЕЛЬ, а не про человека,
   * и потому живёт в шапке списка, а не в строке каждого: действие над столом, размноженное по
   * людям, читается как действие над человеком — и тогда непонятно, кому же ставят стул.
   */
  readonly table?: TopHudTable | undefined;
  /**
   * САМА КОМНАТА — её настройки и то, что мне в них разрешено. Открывается тапом по названию и
   * коду: это и есть имя стола, и за ним стоит сам стол, а не список сидящих за ним.
   */
  readonly settings?: TopHudRoom | undefined;
  /**
   * ЧТО ДЕЛАТЬ, КОГДА В ПАНЕЛИ НАЖАЛИ. Полоса не знает ни комнаты, ни прав: она рисует то, что ей
   * дали, и передаёт нажатие тому, кто умеет спросить стол.
   */
  readonly onDeed?: ((deed: string, whom: string, colour?: string, value?: string) => void) | undefined;
}

export interface TopHudOptions extends Partial<TopHudState> {
  /** Anything this game wants turned. By default a game turns nothing. */
  readonly look?: Partial<TopHudLook> | undefined;
}

export interface TopHud {
  /** Say something new. Whatever is left out stays as it was. */
  set(patch: Partial<TopHudState>): void;
  /** Сказать вслух, почему не вышло: отказ комнаты словами, на той строке, где его ждут. */
  denied(why: string): void;
  /** The strip's own element — what a page measures when it asks what is over the game's region. */
  readonly element: HTMLElement;
  /** How much of the glass it is covering, notch included, in CSS pixels. */
  height(): number;
  stop(): void;
}

/** Stand the strip up over `container`. The return value takes it down completely. */
export function topHud(container: HTMLElement, o: TopHudOptions = {}): TopHud {
  const look = topHudLook(o.look);
  let state: TopHudState = {
    title: o.title ?? "",
    room: o.room,
    people: o.people ?? [],
    roster: o.roster ?? [],
    exit: o.exit,
    ...(o.table ? { table: o.table } : {}),
    ...(o.settings ? { settings: o.settings } : {}),
    ...(o.onDeed ? { onDeed: o.onDeed } : {}),
  };
  /** Whether the full list is open. A fact about this screen, and it outlives a redraw. */
  let listOpen = false;
  /**
   * КАКОЙ ЛИСТ ОТКРЫТ. Людей открывают тапом по ряду лиц, комнату — тапом по коду: у стола два
   * разных разговора, и мешать их в одном экране значит прятать один за другим.
   */
  let opened: "people" | "room" | undefined;
  /** Чья строка раскрыта — там, где кнопки. Раскрытая строка одна: лист не гармошка. */
  let openRow: string | undefined;
  /** Открыта ли палитра, и на чьей строке: кнопка цвета стоит в строке, а не в раскрытии. */
  let palette = false;
  let paintRow: string | undefined;
  /** Последний отказ комнаты, словами. Живёт до следующего действия. */
  let refusal: string | undefined;
  /** Спросили свой код — поле для него открыто. Закрывается вместе с листом. */
  let askingCode = false;
  /** Показан ли квадрат для камеры. Он большой, и всё время висеть ему незачем. */
  let showQr = false;
  /** Что экран только что сделал сам, словами. Живёт до следующего нажатия. */
  let said: string | undefined;

  installSheet();
  const element = document.createElement("div");
  element.className = "crossade-tophud";
  element.style.cssText =
    `position:absolute;left:0;right:0;top:0;z-index:9;` +
    fillCss(look) +
    lineCss(look) +
    shadowCss(look, true);
  container.appendChild(element);

  /**
   * ЛИСТ СО СПИСКОМ — ВТОРОЙ ЭЛЕМЕНТ, А НЕ ЧАСТЬ ПОЛОСЫ: он накрывает стол целиком, а полоса высотой
   * в сорок четыре пикселя. Стоит рядом с ней в том же контейнере и уходит вместе с ней.
   */
  const sheet = document.createElement("div");
  sheet.className = "crossade-tophud-sheet";
  sheet.hidden = true;
  sheet.style.cssText = `position:absolute;inset:0;z-index:20;background:${tint(PALETTE.black, 0.55)}`;
  container.appendChild(sheet);

  const glass = (): number => container.clientWidth || element.clientWidth || 0;

  const backHtml = (): string => {
    if (!state.exit || look.back === "none") return "";
    const icon = look.back === "word" ? "" : svg(ICON.back, Math.round(look.height * 0.42), PALETTE.ink);
    const word =
      look.back === "icon"
        ? ""
        : `<span style="font:400 ${Math.max(9, Math.round(look.height * 0.2))}px ${LETTER};letter-spacing:.04em;color:${PALETTE.ink}">` +
          `${esc(state.exit.word ?? look.backWord)}</span>`;
    return (
      `<div data-g="back" role="button" tabindex="0" style="${plateCss(look.radius)}display:flex;align-items:center;gap:6px;` +
      `height:${look.height - 12}px;padding:0 ${look.back === "icon" ? 8 : 12}px;box-sizing:border-box;cursor:pointer">${icon}${word}</div>`
    );
  };

  const roomHtml = (): string => {
    if (!state.room) return "";
    const code = esc(state.room);
    if (look.room === "mono") {
      return `<span style="font:400 ${Math.max(9, Math.round(look.height * 0.19))}px ${DIGIT};color:${PALETTE.gold}">${code}</span>`;
    }
    return (
      `<span data-g="room" style="display:inline-flex;align-items:center;flex:none;gap:5px;background:${PALETTE.black};` +
      `box-shadow:inset 0 0 0 2px ${PALETTE.gold};border-radius:6px;padding:3px 7px;` +
      `font:400 ${Math.max(8, Math.round(look.height * 0.17))}px ${DIGIT};color:${PALETTE.gold}">` +
      `${code}${look.room === "plate+copy" ? svg(ICON.copy, 12, PALETTE.gold, 2.6) : ""}</span>`
    );
  };

  const nameHtml = (): string =>
    `<span style="flex:0 1 auto;min-width:0;font:400 ${Math.max(11, Math.round(look.height * 0.26))}px ${LETTER};` +
    `color:${PALETTE.ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${nameCap(glass(), look)}px">` +
    `${esc(state.title)}</span>`;

  const groupFill = (): string =>
    look.shape === "band" ? "" : fillCss(look) + shadowCss(look, false) + `border-radius:${look.radius}px;`;
  const groupPad = (): number => (look.shape === "band" ? 0 : 10);

  const titleHtml = (): string => {
    const name = state.title ? nameHtml() : "";
    const room = roomHtml();
    const inner =
      look.title === "none" ? "" : look.title === "name" ? name : look.title === "room" ? room : `${name}${room}`;
    if (!inner) return "";
    return (
      `<div data-g="title" style="${groupFill()}display:flex;align-items:center;gap:${look.gap}px;` +
      `height:${look.height - 12}px;padding:0 ${groupPad()}px;box-sizing:border-box;min-width:0">${inner}</div>`
    );
  };

  const ballHtml = (inner: string, bg: string, left: number, z: number, extra: string, size: number): string =>
    `<div style="position:absolute;left:${left}px;top:0;z-index:${z};width:${size}px;height:${size}px;border-radius:50%;` +
    `display:flex;align-items:center;justify-content:center;background:${bg};${extra}">${inner}</div>`;

  const peopleHtml = (): string => {
    const row = peopleRow(state.people, look);
    if (row.balls.length === 0) return "";
    const size = look.avatar;
    const circles = row.balls
      .map((ball) => {
        if (ball.kind === "more") {
          return ballHtml(
            `<span style="font:400 ${Math.round(size * 0.4)}px ${LETTER};color:${PALETTE.gold}">+${ball.count}</span>`,
            PALETTE.well,
            ball.left,
            ball.z,
            `box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.panel};`,
            size,
          );
        }
        const p = ball.person;
        const turn = p.turn === true && look.turn !== "none";
        // ЕГО ЛИЦО, ЕСЛИ ОНО ЕСТЬ, — узнаётся быстрее буквы. Цвет при фотографии уходит в ободок:
        // залитый кружок под картинкой не виден, а цвет и есть то, чем человека различают.
        const face = p.face
          ? `<img src="${esc(p.face)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block">`
          : look.avatarLook === "letter"
            ? `<span style="font:400 ${Math.round(size * 0.42)}px ${LETTER};color:${PALETTE.black}">${esc(p.name.slice(0, 1))}</span>`
            : look.avatarLook === "chair"
              ? svg(ICON.chair, Math.round(size * 0.62), PALETTE.black, 2)
              : "";
        const rim = p.face ? `,0 0 0 3px ${p.ink}` : "";
        const ring =
          turn && look.turn === "ring"
            ? `box-shadow:inset 0 0 0 3px ${PALETTE.black},0 0 0 3px ${PALETTE.gold};`
            : `box-shadow:inset 0 0 0 3px ${PALETTE.black}${rim};`;
        const glow = turn && look.turn === "glow" ? `filter:drop-shadow(0 0 7px ${PALETTE.gold});` : "";
        const dim = p.away === true && look.away === "dim" ? "opacity:.42;filter:grayscale(1);" : "";
        const dot =
          turn && look.turn === "dot"
            ? `<i style="position:absolute;left:50%;bottom:-5px;transform:translateX(-50%);width:6px;height:6px;` +
              `border-radius:50%;background:${PALETTE.gold}"></i>`
            : "";
        return ballHtml(face + dot, p.face ? PALETTE.well : p.ink, ball.left, ball.z, `overflow:hidden;` + ring + glow + dim, size);
      })
      .join("");
    return (
      `<div data-g="people" role="button" tabindex="0" style="${groupFill()}position:relative;flex:none;height:${look.height}px;` +
      `padding:0 ${groupPad()}px;box-sizing:border-box;cursor:pointer">` +
      `<div style="position:relative;width:${row.width}px;height:${size}px;margin-top:${Math.round((look.height - size) / 2)}px">` +
      `${circles}</div></div>`
    );
  };

  /**
   * ВЕСЬ СПИСОК — ЛИСТОМ СНИЗУ, А НЕ ЯЩИКОМ ПОД ПОЛОСОЙ.
   *
   * Полоса несёт восемь лиц и говорит «кто играет»; лист говорит «чей это стол», и это разговор на
   * целый экран: имя, роль, стул. Ящик под полосой для него мал — в нём строка сжимается до имени
   * и цветной точки, а роль и «без стула» некуда положить.
   *
   * Лист живёт в КОНТЕЙНЕРЕ ИГРЫ, а не внутри полосы: полоса высотой в 44 пикселя, и всё, что
   * растянуто по ней, растянуто по этим сорока четырём.
   */
  /**
   * КОМНАТА — ЕЁ СОБСТВЕННЫЙ ЛИСТ, и открывается он тапом по названию и коду: это имя стола, и за
   * ним стоит сам стол — его код, его мебель, его правила и то, переживёт ли он этот вечер.
   *
   * Разметку строит отдельный файл: она чистая функция от того, что сказали сервер и палец, и
   * порядок блоков проверяется без браузера.
   */
  const roomHtmlSheet = (): string =>
    state.settings === undefined
      ? ""
      : roomSheetHtml({
          room: state.settings,
          game: state.title,
          ...(state.table ? { table: state.table } : {}),
          ...(refusal ? { refusal } : {}),
          askingCode,
          showQr,
          ...(said ? { said } : {}),
          ...(tableLink() ? { link: tableLink() } : {}),
        });

  /**
   * АДРЕС, ПО КОТОРОМУ ОТКРЫТ ЭТОТ СТОЛ. Знает его браузер, а не сервер: комната знает свой код, но
   * не знает, на каком доме она живёт и через какую дверь в неё сегодня зашли.
   */
  const tableLink = (): string | undefined =>
    typeof location === "undefined" ? undefined : location.href;

  const drawSheet = (): void => {
    if (!listOpen) {
      sheet.innerHTML = "";
      sheet.hidden = true;
      return;
    }
    const known = state.roster.length > 0;
    const list = known ? rosterList(state.roster) : undefined;
    const present = peopleRow(state.people, look).seated;
    const mine = list?.rows.find((one) => one.mine === true);
    const rest = list ? list.rows.filter((one) => one !== mine) : [];
    // ДВА ЧИСЛА, И ТОЛЬКО ДВА: сколько сидит и сколько всего людей. Мебель считают в листе комнаты —
    // это разговор про стол, а не про тех, кто за ним.
    const head = list ? `ЗА СТОЛОМ ${list.seated} · ВСЕГО ${list.total}` : `ЗА СТОЛОМ ${present.length}`;
    // ЗАНЯТЫЕ ЦВЕТА ВИДНО В ПАЛИТРЕ: восемь на всех, и брать чужой — значит стать неотличимым.
    const taken = new Set((list?.rows ?? []).map((one) => one.ink));
    const rows = list ? rest.map((one) => memberRowHtml(one, taken)).join("") : present.map(listRowHtml).join("");
    sheet.hidden = false;
    sheet.innerHTML =
      `<div data-g="list" style="position:absolute;left:0;right:0;bottom:0;max-height:86%;overflow:auto;` +
      `background:${PALETTE.felt};box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.panel};` +
      `border-radius:16px 16px 0 0;padding-bottom:24px">` +
      // ШАПКА ПРИЛИПАЕТ: список длиннее экрана, и «Закрыть», уехавшее вверх, читается как ловушка.
      `<div style="position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px;` +
      `padding:14px 18px 8px;background:${PALETTE.felt}">` +
      `<span style="font:400 15px ${LETTER};letter-spacing:.08em;color:${PALETTE.gold}">${opened === "room" ? "КОМНАТА" : "ЗА СТОЛОМ"}</span>` +
      `<span data-g="close" role="button" tabindex="0" style="cursor:pointer;font:400 13px ${LETTER};border-radius:8px;padding:8px 12px;` +
      `box-shadow:inset 0 0 0 2px ${PALETTE.wood};color:${PALETTE.inkDim}">Закрыть</span></div>` +
      (opened === "room" ? roomHtmlSheet() : "") +
      (opened === "room" ? "" : `<div style="padding:0 18px">`) +
      (opened === "room" ? "" : mine ? mineRowHtml(mine, taken) : "") +
      (opened === "room"
        ? ""
        : `<div style="font:400 10px ${LETTER};letter-spacing:.1em;color:${PALETTE.inkDim};opacity:.7;padding:6px 0 2px">${head}</div>${rows}</div>`) +
      `</div>`;
  };

  /**
   * ЗНАЧОК — ИЗ ДВУХ ОСЕЙ: уровень даёт цвет, стул — слово. Цветом плашки читается власть (хозяин
   * золотом, админ светлым, игрок деревом), а сидит человек или смотрит — сказано словом, и
   * зритель поэтому стоит приглушённым: он в комнате, но не за столом.
   */
  const ROLE_PAINT: Record<RosterRole, string> = {
    owner: PALETTE.gold,
    admin: PALETTE.ink,
    player: PALETTE.wood,
  };

  const roleBadge = (member: TopHudMember): string => {
    const paint = member.role === "player" && !member.seated ? PALETTE.inkDim : ROLE_PAINT[member.role];
    return (
      `<span style="font:400 10px ${LETTER};letter-spacing:.08em;text-transform:uppercase;border-radius:5px;padding:2px 6px;` +
      `background:${paint};color:${PALETTE.black}">${roleWord(member.role, member.seated)}</span>`
    );
  };

  /**
   * ЛИЦО В КРУЖКЕ — ЕГО ФОТОГРАФИЯ, если он её выбрал, и первая буква имени, если нет. Цвет при
   * фотографии уходит в ОБОДОК: залитый кружок под картинкой не виден, а цвет — это то, чем человека
   * узнают на сукне, и потерять его нельзя.
   */
  const memberBall = (member: TopHudMember, size: number, ring: boolean): string => {
    const rim = member.face
      ? `box-shadow:inset 0 0 0 3px ${PALETTE.black},0 0 0 3px ${member.ink}${ring ? `,0 0 0 6px ${PALETTE.gold}` : ""};`
      : `box-shadow:inset 0 0 0 3px ${PALETTE.black}${ring ? `,0 0 0 3px ${PALETTE.gold}` : ""};`;
    const inside = member.face
      ? `<img src="${esc(member.face)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block">`
      : `<span style="font:400 ${Math.round(size * 0.42)}px ${LETTER};color:${PALETTE.black}">${esc(member.name.slice(0, 1))}</span>`;
    return (
      `<span style="flex:none;width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;display:flex;align-items:center;` +
      `justify-content:center;background:${member.face ? PALETTE.well : member.ink};${rim}` +
      `${member.seated ? "" : "opacity:.55;"}">${inside}</span>`
    );
  };

  /** Где человек сидит, одной строкой: стул, и держится ли за ним кто-то прямо сейчас. */
  const whereWord = (member: TopHudMember): string =>
    member.seated ? (member.away === true ? "за столом · отошёл" : "за столом") : "без стула";

  /**
   * СВОЯ СТРОКА — ОТДЕЛЬНОЙ КАРТОЧКОЙ НАД СПИСКОМ, с золотой кромкой и крупным лицом. Себя не ищут
   * глазами среди чужих имён: из всего списка своя строка — единственная, за которой человек сюда
   * и пришёл.
   */
  const mineRowHtml = (member: TopHudMember, taken: ReadonlySet<string>): string => {
    const open = openRow === keyOf(member);
    return (
      `<div style="margin:6px 0 14px;background:${PALETTE.well};` +
      `box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.wood};border-radius:12px;padding:12px 14px">` +
      `<div data-g="mine" data-row="${esc(keyOf(member))}" role="button" tabindex="0" ` +
      `style="cursor:pointer;display:flex;align-items:center;gap:12px">` +
      memberBall(member, 46, true) +
      `<span style="display:flex;flex-direction:column;gap:4px;min-width:0;flex:1">` +
      `<span style="font:400 17px ${LETTER};color:${PALETTE.ink}">${esc(member.name)}</span>` +
      `<span style="display:flex;gap:6px;align-items:center">${roleBadge(member)}` +
      `<span style="font:400 10px ${LETTER};color:${PALETTE.inkDim}">${whereWord(member)}</span></span>` +
      `</span>` +
      ((member.can ?? []).some((one) => one.deed === "colour") ? colourButton(member, open && palette) : "") +
      `<span style="font:400 18px ${LETTER};color:${PALETTE.inkDim};transform:rotate(${open ? 90 : 0}deg);transition:transform .15s">›</span>` +
      `</div>` +
      (palette && paintRow === keyOf(member) ? paletteRow(member, taken) : "") +
      (open ? rowBelly(member, taken) : "") +
      `</div>`
    );
  };

  /** Комнаты не знаем (игра на своём URL) — остаются те, кто сейчас за столом, и только имена. */
  const listRowHtml = (p: TopHudPerson): string =>
    `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;box-shadow:inset 0 3px 0 -1px ${tint(PALETTE.black, 0.55)}">` +
    `<span style="flex:none;width:22px;height:22px;border-radius:50%;background:${p.ink};box-shadow:inset 0 0 0 2px ${PALETTE.black};` +
    `${p.away === true ? "opacity:.42;filter:grayscale(1);" : ""}"></span>` +
    `<span style="font:400 14px ${LETTER};color:${p.away === true ? PALETTE.inkDim : PALETTE.ink};flex:1">${esc(p.name)}</span>` +
    (p.turn === true ? `<span style="font:400 11px ${LETTER};color:${PALETTE.gold}">ходит</span>` : "") +
    (p.away === true ? `<span style="font:400 11px ${LETTER};color:${PALETTE.inkDim}">отошёл</span>` : "") +
    `</div>`;

  /**
   * ЦВЕТ — ЗНАК НА СТРОКЕ ИМЕНИ, а не пункт в раскрытии: сам цвет и есть иконка, и стоит она там же,
   * где про человека всё остальное. Раскрывать строку ради цвета не нужно — он рядом с лицом.
   */
  const colourButton = (member: TopHudMember, open: boolean): string =>
    `<button data-g="paint" data-whom="${esc(keyOf(member))}" title="сменить цвет" style="flex:none;cursor:pointer;border:0;` +
    `border-radius:8px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;background:${PALETTE.panelLight};` +
    `box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${open ? PALETTE.gold : PALETTE.wood}">` +
    `<span style="width:16px;height:16px;border-radius:50%;background:${member.ink};box-shadow:inset 0 0 0 2px ${PALETTE.black}"></span></button>`;

  /** Ключ строки — номер аккаунта, а когда его нет, имя: раскрытая строка должна пережить перерисовку. */
  const keyOf = (member: TopHudMember): string => member.account ?? member.name;

  /** Кнопка действия. Золотом — то, что даёт; тревожным — то, что отнимает человека у стола. */
  const deedButton = (member: TopHudMember, deed: { deed: string; label: string; vote?: boolean }): string => {
    const grave = deed.deed === "kick" || deed.deed === "owner:pass";
    const gold = deed.deed === "seat:give";
    return (
      `<button data-deed="${esc(deed.deed)}" data-whom="${esc(keyOf(member))}" style="cursor:pointer;border:0;border-radius:8px;` +
      `padding:8px 10px;font:400 12px ${LETTER};` +
      (gold
        ? `background:${PALETTE.gold};color:${PALETTE.black};box-shadow:inset 0 0 0 3px ${PALETTE.black};`
        : grave
          ? `background:transparent;color:${PALETTE.danger};box-shadow:inset 0 0 0 2px ${PALETTE.danger};`
          : `background:${PALETTE.panelLight};color:${PALETTE.ink};box-shadow:inset 0 0 0 3px ${PALETTE.black};`) +
      `">${esc(deed.label)}</button>`
    );
  };

  /**
   * ПАЛИТРА — ВОСЕМЬ ЦВЕТОВ, И ЗАНЯТЫЕ ВИДНО. Цвет выбирают не из колеса: он должен быть узнаваем
   * через стол с другого конца, а не подобран.
   */
  const paletteRow = (member: TopHudMember, taken: ReadonlySet<string>): string =>
    `<div data-g="palette" style="display:flex;gap:7px;flex-wrap:wrap;padding:10px 0 2px">` +
    FAVOURITE_INKS.map((ink) => {
      const now = member.ink === ink;
      // ЗАНЯТЫЙ СОСЕДОМ ЦВЕТ ПЕРЕЧЁРКНУТ И НЕ НАЖИМАЕТСЯ: два одинаковых цвета за столом — ровно та
      // беда, от которой цвет и заведён, и предлагать её кнопкой нельзя.
      const busy = taken.has(ink) && !now;
      return (
        `<button ${busy ? "" : `data-colour="${ink}" data-whom="${esc(keyOf(member))}"`} ` +
        `title="${busy ? "цвет занят" : ""}" style="position:relative;width:30px;height:30px;border:0;border-radius:50%;` +
        `${busy ? "cursor:not-allowed;opacity:.35;" : "cursor:pointer;"}background:${ink};` +
        `box-shadow:inset 0 0 0 3px ${PALETTE.black}${now ? `,0 0 0 3px ${PALETTE.gold}` : ""}">` +
        (busy
          ? `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;` +
            `font:400 15px ${LETTER};color:${PALETTE.black}">×</span>`
          : "") +
        `</button>`
      );
    }).join("") +
    `</div>`;

  /**
   * ЧТО ВИДНО ПОД РАСКРЫТОЙ СТРОКОЙ: что можно — кнопками, чего нельзя — словами.
   *
   * Отказы показываются ВСЕ и всегда: молча пропавшая кнопка читается как поломка, и первым делом
   * про неё спрашивают «почему у меня нет кика».
   */
  /**
   * ДВЕ СЕКЦИИ ПОД СТРОКОЙ, КАК НА СТЕНДЕ: «СТАТУС РУКИ» — знаками, «МЕСТО И ПРАВА» — словами.
   *
   * Статус руки — это ЗНАК, а не фраза: лок, пин и скрытность включены или нет, и это надо видеть
   * одним взглядом. Включённое горит золотом, выключенное стоит тёмной плашкой.
   */
  const HAND_GLYPH: Record<string, string> = {
    "piece:lock": "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
    "piece:pin": "M9 3h6l-1 6h2l1 5H7l1-5h2L9 3zM12 14v7",
    "piece:hide": "M3 3l18 18M10.6 6.2A9 9 0 0 1 22 12s-1.5 2.6-4.3 4.5M6.4 7.6C3.9 9.3 2 12 2 12s4 7 10 7c1.5 0 2.9-.3 4.1-.9",
  };

  const handOn = (member: TopHudMember, deed: string): boolean => {
    const hand = member.hand;
    return deed === "piece:lock" ? hand?.lock === true : deed === "piece:pin" ? hand?.pin === true : hand?.hide === true;
  };

  const handButton = (member: TopHudMember, deed: { deed: string; label: string }): string => {
    const lit = handOn(member, deed.deed);
    return (
      `<button data-deed="${esc(deed.deed)}" data-whom="${esc(keyOf(member))}" title="${esc(deed.label)}" ` +
      `style="cursor:pointer;border:0;border-radius:8px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;` +
      (lit
        ? `background:${PALETTE.gold};box-shadow:inset 0 0 0 3px ${PALETTE.black};`
        : `background:${PALETTE.panelLight};box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.wood};`) +
      `">` +
      `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="${lit ? PALETTE.black : PALETTE.ink}" ` +
      `stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${HAND_GLYPH[deed.deed]}"/></svg></button>`
    );
  };

  const section = (title: string, inner: string): string =>
    !inner
      ? ""
      : `<div style="display:flex;flex-direction:column;gap:6px;padding-top:8px">` +
        `<span style="font:400 10px ${LETTER};letter-spacing:.1em;color:${PALETTE.inkDim};opacity:.7">${title}</span>` +
        `<div style="display:flex;gap:6px;flex-wrap:wrap">${inner}</div></div>`;

  const rowBelly = (member: TopHudMember, taken: ReadonlySet<string>): string => {
    const can = member.can ?? [];
    const cant = member.cant ?? [];
    const hand = can.filter((one) => one.deed.startsWith("piece:"));
    const others = can.filter((one) => one.deed !== "colour" && !one.deed.startsWith("piece:"));
    return (
      `<div style="display:flex;flex-direction:column;gap:8px;padding:2px 0 12px">` +
      section("СТАТУС РУКИ", hand.map((one) => handButton(member, one)).join("")) +
      section("МЕСТО И ПРАВА", others.map((one) => deedButton(member, one)).join("")) +
      // ЧЕГО НЕЛЬЗЯ — ОДНИМ БЛОКОМ ПОД ЗАГОЛОВКОМ, а не россыпью строк: это не предупреждение и не
      // ошибка, это список того, чего у тебя нет, и читают его целиком, когда ищут пропавшую кнопку.
      (refusal || cant.length > 0
        ? `<div style="display:flex;flex-direction:column;gap:3px;padding-top:10px">` +
          `<span style="font:400 10px ${LETTER};letter-spacing:.1em;color:${PALETTE.inkDim};opacity:.7">НЕЛЬЗЯ</span>` +
          // ОТКАЗ КОМНАТЫ СТОИТ ПЕРВЫМ И В ТЕХ ЖЕ СЛОВАХ: он про то, что человек только что нажал, а
          // не про то, чего у него нет вообще.
          (refusal ? `<span style="font:400 12px ${LETTER};color:${PALETTE.ink}">${esc(refusal)}</span>` : "") +
          cant
            .map(
              (one) =>
                `<span style="font:400 12px ${LETTER};color:${PALETTE.inkDim};opacity:.75">${esc(one.label)} — ${esc(one.why)}</span>`,
            )
            .join("") +
          `</div>`
        : "") +
      `</div>`
    );
  };

  const memberRowHtml = (member: TopHudMember, taken: ReadonlySet<string>): string => {
    const open = openRow === keyOf(member);
    return (
      `<div style="box-shadow:inset 0 3px 0 -1px ${tint(PALETTE.black, 0.55)}">` +
      `<div data-row="${esc(keyOf(member))}" role="button" tabindex="0" style="display:flex;align-items:center;gap:10px;padding:11px 0;cursor:pointer">` +
      memberBall(member, 34, member.mine === true) +
      `<span style="display:flex;flex-direction:column;gap:3px;min-width:0;flex:1">` +
      `<span style="font:400 15px ${LETTER};color:${member.seated ? PALETTE.ink : PALETTE.inkDim}">${esc(member.name)}</span>` +
      `<span style="display:flex;gap:6px;align-items:center">${roleBadge(member)}` +
      `<span style="font:400 10px ${LETTER};color:${PALETTE.inkDim}">${whereWord(member)}</span></span>` +
      `</span>` +
      ((member.can ?? []).some((one) => one.deed === "colour") ? colourButton(member, open && palette) : "") +
      `<span style="font:400 15px ${LETTER};color:${PALETTE.inkDim};transform:rotate(${open ? 90 : 0}deg);transition:transform .15s">›</span>` +
      `</div>` +
      (palette && paintRow === keyOf(member) ? paletteRow(member, taken) : "") +
      (open ? rowBelly(member, taken) : "") +
      `</div>`
    );
  };

  const widthOf = (group: string): number => {
    const el = element.querySelector<HTMLElement>(`[data-g="${group}"]`);
    return el ? Math.round(el.getBoundingClientRect().width) : 0;
  };

  const draw = (): void => {
    const back = backHtml();
    const people = peopleHtml();
    const title = titleHtml();
    const centred = look.titleAlign === "center";
    const left = look.peopleSide === "left" ? back + people : back;
    const right = look.peopleSide === "left" ? "" : people;
    const row =
      `display:flex;align-items:center;justify-content:space-between;gap:${look.gap}px;height:${look.height}px;` +
      `padding:0 ${look.side}px;box-sizing:border-box;position:relative`;
    element.innerHTML =
      `<div style="${row}">` +
      // WITHOUT `min-width:0` A FLEX GROUP WILL NOT SHRINK below what is in it, and a long name
      // carries the people off the screen — which reads as "nobody is here", not as "it did not fit".
      `<div style="display:flex;align-items:center;gap:${look.gap}px;min-width:0;overflow:hidden">${left}${centred ? "" : title}</div>` +
      (centred && title
        ? `<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none">${title}</div>`
        : "") +
      `<div style="display:flex;align-items:center;gap:${look.gap}px">${right}</div>` +
      `</div>`;

    // WHAT THE NAME WANTED, not what the flex box already squeezed it to: a measured frame always
    // answers "it fits exactly", because the squeeze has already happened.
    const titleEl = element.querySelector<HTMLElement>('[data-g="title"]');
    if (titleEl) {
      const fit = fitTitle(
        { glass: glass(), backWidth: widthOf("back"), peopleWidth: widthOf("people"), titleWant: titleEl.scrollWidth },
        look,
      );
      if (fit.dropped) titleEl.style.display = "none";
      else if (fit.titleMax !== undefined) titleEl.style.maxWidth = `${fit.titleMax}px`;
    }

    // Bound after every draw, because the strip is rebuilt whole — cheaper than keeping its nodes
    // alive for the sake of two listeners.
    document.documentElement.style.setProperty(TOP_HUD_VAR, `${Math.round(element.getBoundingClientRect().height)}px`);

    const backEl = element.querySelector<HTMLElement>('[data-g="back"]');
    if (backEl) {
      backEl.onclick = (e) => {
        e.stopPropagation();
        state.exit?.go();
      };
    }
    const peopleEl = element.querySelector<HTMLElement>('[data-g="people"]');
    if (peopleEl) {
      peopleEl.onclick = (e) => {
        e.stopPropagation();
        listOpen = !(listOpen && opened === "people");
        opened = "people";
        draw();
      };
    }
    // НАЗВАНИЕ И КОД — ЭТО ИМЯ СТОЛА, и тап по нему открывает сам стол: его код, его мебель, его
    // правила. Открывает ВСЯ плашка целиком, а не один код: название и код стоят в ней рядом, и
    // попадать пальцем в четыре цифры, когда рядом мёртвое слово, — это попадать мимо.
    const openRoomSheet = (e: Event): void => {
      e.stopPropagation();
      listOpen = !(listOpen && opened === "room");
      opened = "room";
      askingCode = false;
      showQr = false;
      said = undefined;
      refusal = undefined;
      draw();
    };
    const titleGroup = element.querySelector<HTMLElement>('[data-g="title"]');
    if (titleGroup && state.settings !== undefined) {
      titleGroup.style.cursor = "pointer";
      titleGroup.style.pointerEvents = "auto";
      titleGroup.onclick = openRoomSheet;
    }

    drawSheet();
    // Сам лист палец не закрывает — иначе список нельзя было бы листать. Закрывают «Закрыть» и
    // касание мимо, по затемнению: то и другое — один и тот же жест «я посмотрел».
    const listEl = sheet.querySelector<HTMLElement>('[data-g="list"]');
    if (listEl) listEl.onclick = (e) => e.stopPropagation();
    const closeEl = sheet.querySelector<HTMLElement>('[data-g="close"]');
    if (closeEl) closeEl.onclick = () => shut();

    // РАСКРЫТАЯ СТРОКА ОДНА: лист не гармошка, и вторая раскрытая уводит первую с глаз.
    for (const row of sheet.querySelectorAll<HTMLElement>("[data-row]")) {
      row.onclick = (e) => {
        e.stopPropagation();
        const key = row.dataset.row!;
        openRow = openRow === key ? undefined : key;
        palette = false;
        refusal = undefined;
        draw();
      };
    }
    const chairsEl = sheet.querySelector<HTMLInputElement>('[data-g="chairs"]');
    const chairsValue = sheet.querySelector<HTMLElement>('[data-g="chairs-value"]');
    if (chairsEl) {
      // ЧИСЛО ПОД ПАЛЬЦЕМ ИДЁТ СРАЗУ, А СТУЛ СТАВИТСЯ ПО ОТПУСКАНИИ: иначе за одно движение через
      // весь ползунок стол получил бы два десятка стульев по дороге.
      chairsEl.oninput = () => {
        if (chairsValue) chairsValue.textContent = chairsEl.value;
      };
      chairsEl.onchange = () => {
        const now = state.table?.chairs ?? 0;
        for (let i = now; i < Number(chairsEl.value); i += 1) state.onDeed?.("seat:add", "");
      };
    }
    /**
     * НАЖАЛИ В ЭКРАНЕ КОМНАТЫ. Три из этих кнопок делает сам экран, остальное уходит комнате:
     * ссылка — это адрес, который известен браузеру, а не серверу; «свой код» открывает поле; QR
     * рисуется из того же адреса.
     */
    for (const button of sheet.querySelectorAll<HTMLElement>("[data-room]")) {
      button.onclick = (e) => {
        e.stopPropagation();
        const deed = button.dataset.room!;
        const value = button.dataset.value;
        refusal = undefined;
        said = undefined;
        if (deed === "qr") {
          showQr = !showQr;
          return draw();
        }
        if (deed === "room:link") {
          const link = tableLink();
          // СКОПИРОВАТЬ — ДЕЛО ЭКРАНА, А НЕ КОМНАТЫ: сервер не знает ни адреса, ни буфера обмена.
          // Не дали скопировать — говорим адрес словами, чтобы его можно было взять руками.
          void navigator.clipboard
            ?.writeText(link ?? "")
            .then(() => {
              said = "ссылка скопирована";
              draw();
            })
            .catch(() => {
              said = link;
              draw();
            });
          return;
        }
        if (deed === "code:own") {
          askingCode = !askingCode;
          return draw();
        }
        if (deed === "code:new") {
          // НОВЫЙ КОД — ТОТ ЖЕ ПРОСЬБЕ, ПРОСТО БЕЗ НАЗВАННОГО: стол получает выданный.
          state.onDeed?.("room:code", "");
          return;
        }
        if (deed === "code:take") {
          const field = sheet.querySelector<HTMLInputElement>('[data-g="code"]');
          const asked = field?.value.trim();
          if (!asked) return;
          state.onDeed?.("room:code", "", undefined, asked);
          askingCode = false;
          return draw();
        }
        state.onDeed?.(deed, "", undefined, value);
      };
    }
    for (const paint of sheet.querySelectorAll<HTMLElement>('[data-g="paint"]')) {
      paint.onclick = (e) => {
        e.stopPropagation();
        const whom = paint.dataset.whom!;
        palette = !(palette && paintRow === whom);
        paintRow = whom;
        refusal = undefined;
        draw();
      };
    }
    for (const swatch of sheet.querySelectorAll<HTMLElement>("[data-colour]")) {
      swatch.onclick = (e) => {
        e.stopPropagation();
        refusal = undefined;
        state.onDeed?.("colour", swatch.dataset.whom!, swatch.dataset.colour!);
        palette = false;
        paintRow = undefined;
        draw();
      };
    }
    for (const button of sheet.querySelectorAll<HTMLElement>("[data-deed]")) {
      button.onclick = (e) => {
        e.stopPropagation();
        refusal = undefined;
        state.onDeed?.(button.dataset.deed!, button.dataset.whom!);
        draw();
      };
    }
  };

  /** The list shuts on a touch anywhere else — the desk under it included. */
  const shut = (): void => {
    if (!listOpen) return;
    listOpen = false;
    draw();
  };
  const onResize = (): void => draw();
  document.addEventListener("click", shut);
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  draw();

  return {
    element,
    set(patch) {
      state = { ...state, ...patch };
      draw();
    },
    denied(why) {
      refusal = why;
      draw();
    },
    height: () => Math.round(element.getBoundingClientRect().height),
    stop() {
      document.removeEventListener("click", shut);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      document.documentElement.style.removeProperty(TOP_HUD_VAR);
      sheet.remove();
      element.remove();
    },
  };
}
