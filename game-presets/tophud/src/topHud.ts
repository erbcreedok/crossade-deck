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
import { ROLE_WORD, rosterList, type RosterRole, type TopHudMember } from "./roster.js";

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
   * ЧТО ДЕЛАТЬ, КОГДА В ПАНЕЛИ НАЖАЛИ. Полоса не знает ни комнаты, ни прав: она рисует то, что ей
   * дали, и передаёт нажатие тому, кто умеет спросить стол.
   */
  readonly onDeed?: ((deed: string, whom: string, colour?: string) => void) | undefined;
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
    ...(o.onDeed ? { onDeed: o.onDeed } : {}),
  };
  /** Whether the full list is open. A fact about this screen, and it outlives a redraw. */
  let listOpen = false;
  /** Чья строка раскрыта — там, где кнопки. Раскрытая строка одна: лист не гармошка. */
  let openRow: string | undefined;
  /** Открыта ли палитра на раскрытой строке. */
  let palette = false;
  /** Последний отказ комнаты, словами. Живёт до следующего действия. */
  let refusal: string | undefined;

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
      `<span style="font:400 15px ${LETTER};letter-spacing:.08em;color:${PALETTE.gold}">ЗА СТОЛОМ</span>` +
      `<span data-g="close" role="button" tabindex="0" style="cursor:pointer;font:400 13px ${LETTER};border-radius:8px;padding:8px 12px;` +
      `box-shadow:inset 0 0 0 2px ${PALETTE.wood};color:${PALETTE.inkDim}">Закрыть</span></div>` +
      `<div style="padding:0 18px">` +
      (mine ? mineRowHtml(mine, taken) : "") +
      `<div style="font:400 10px ${LETTER};letter-spacing:.1em;color:${PALETTE.inkDim};opacity:.7;padding:6px 0 2px">${head}</div>` +
      rows +
      `</div></div>`;
  };

  /**
   * ЗНАЧОК РОЛИ — ПЛАШКА, ЗАЛИТАЯ ЦВЕТОМ САМОЙ РОЛИ. Читается боковым зрением, не требуя прочесть
   * слово: хозяин золотом, админ светлым, игрок деревом, зритель приглушённым.
   */
  const ROLE_PAINT: Record<RosterRole, string> = {
    owner: PALETTE.gold,
    admin: PALETTE.ink,
    player: PALETTE.wood,
    spectator: PALETTE.inkDim,
  };

  const roleBadge = (member: TopHudMember): string =>
    `<span style="font:400 10px ${LETTER};letter-spacing:.08em;text-transform:uppercase;border-radius:5px;padding:2px 6px;` +
    `background:${ROLE_PAINT[member.role]};color:${PALETTE.black}">${ROLE_WORD[member.role]}</span>`;

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
      `<span style="font:400 18px ${LETTER};color:${PALETTE.inkDim};transform:rotate(${open ? 90 : 0}deg);transition:transform .15s">›</span>` +
      `</div>` +
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
    `<div data-g="palette" style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 0 2px">` +
    FAVOURITE_INKS.map(
      (ink) =>
        `<button data-colour="${ink}" data-whom="${esc(keyOf(member))}" style="cursor:pointer;border:0;width:30px;height:30px;` +
        `border-radius:50%;background:${ink};box-shadow:inset 0 0 0 3px ${PALETTE.black}` +
        (member.ink === ink ? `,0 0 0 3px ${PALETTE.gold}` : taken.has(ink) ? `,0 0 0 3px ${PALETTE.well}` : "") +
        `;${taken.has(ink) && member.ink !== ink ? "opacity:.45;" : ""}"></button>`,
    ).join("") +
    `</div>`;

  /**
   * ЧТО ВИДНО ПОД РАСКРЫТОЙ СТРОКОЙ: что можно — кнопками, чего нельзя — словами.
   *
   * Отказы показываются ВСЕ и всегда: молча пропавшая кнопка читается как поломка, и первым делом
   * про неё спрашивают «почему у меня нет кика».
   */
  const rowBelly = (member: TopHudMember, taken: ReadonlySet<string>): string => {
    const can = member.can ?? [];
    const cant = member.cant ?? [];
    const colour = can.find((one) => one.deed === "colour");
    const others = can.filter((one) => one.deed !== "colour");
    return (
      `<div style="display:flex;flex-direction:column;gap:8px;padding:2px 0 12px">` +
      (colour
        ? `<button data-g="paint" data-whom="${esc(keyOf(member))}" style="align-self:flex-start;cursor:pointer;border:0;border-radius:8px;` +
          `padding:8px 10px;font:400 12px ${LETTER};background:${PALETTE.panelLight};color:${PALETTE.ink};` +
          `box-shadow:inset 0 0 0 3px ${PALETTE.black}">${esc(colour.label)}</button>` +
          (palette ? paletteRow(member, taken) : "")
        : "") +
      (others.length > 0 ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${others.map((one) => deedButton(member, one)).join("")}</div>` : "") +
      (refusal ? `<span style="font:400 11px ${LETTER};color:${PALETTE.danger}">${esc(refusal)}</span>` : "") +
      (cant.length > 0
        ? `<div style="display:flex;flex-direction:column;gap:3px;padding-top:2px">` +
          cant
            .map(
              (one) =>
                `<span style="font:400 10px ${LETTER};color:${PALETTE.inkDim};opacity:.75">${esc(one.label)} — ${esc(one.why)}</span>`,
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
      `<span style="font:400 15px ${LETTER};color:${PALETTE.inkDim};transform:rotate(${open ? 90 : 0}deg);transition:transform .15s">›</span>` +
      `</div>` +
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
        listOpen = !listOpen;
        draw();
      };
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
    const paint = sheet.querySelector<HTMLElement>('[data-g="paint"]');
    if (paint) {
      paint.onclick = (e) => {
        e.stopPropagation();
        palette = !palette;
        draw();
      };
    }
    for (const swatch of sheet.querySelectorAll<HTMLElement>("[data-colour]")) {
      swatch.onclick = (e) => {
        e.stopPropagation();
        refusal = undefined;
        state.onDeed?.("colour", swatch.dataset.whom!, swatch.dataset.colour!);
        palette = false;
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
