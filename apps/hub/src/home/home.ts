// ПЕРВАЯ СТРАНИЦА ХАБА: кто ты — в углу, и экран настроек за ним.
//
// Полка — холст; это то, что НАД ней, и потому разметка: текст, который умеет укорачиваться, лист,
// который выезжает, и поле ввода, которое на канвасе было бы отдельным проектом.
//
// КНОПКИ ВХОДА ЗДЕСЬ НЕТ. Игрока не встречают авторизацией: у гостя тоже есть профиль — имя, цвет,
// аватар копятся с первого касания, — а подталкивает назваться сама кличка, выданная столом.
// Настоящий вход живёт там, где без личности нет ответа: перенос себя, владение комнатой, друзья.

import { FAVOURITE_INKS, PALETTE, tint } from "@crossade/look";
import {
  ensureAccount,
  linkTelegram,
  myProfile,
  storedAccount,
  telegramInvite,
  telegramInviteState,
  updateProfile,
  type InviteRefusal,
  type InviteState,
  type Profile,
  type TelegramInvite,
} from "@crossade/wire";
import { askInWindow, type Ask } from "./ask.js";
import { homeLook, type HomeLook } from "./look.js";
import {
  ballHtml,
  buttonHtml,
  esc,
  FONT,
  headBandCss,
  labelHtml,
  lineHtml,
  swatchesHtml,
  valueHtml,
} from "./parts.js";
import { every } from "../hub/beat.js";
import { transferLink as transferLinkFor } from "./transfer.js";
import { whoAmI } from "./whoami.js";

/** Как часто страница спрашивает, нажал ли человек «Запустить» в боте. */
const WATCH_EVERY_MS = 1500;

/** Откуда экран берёт профиль и куда девает правки. Подменяется целиком — в тесте и в Mini App. */
export interface ProfileGateway {
  read(): Promise<Profile | undefined>;
  /** Завести этому браузеру аккаунт, если своего у него нет. */
  identify(): Promise<void>;
  save(patch: { name?: string; color?: string; avatar?: string }): Promise<Profile | undefined>;
  /** Подписанная телеграмом строка, если этот экран открыт внутри Mini App. */
  telegramInitData(): string | undefined;
  linkTelegram(initData: string): Promise<"linked" | "switch" | "conflict" | undefined>;
  /** Ссылка в бота для обычного браузера — или причина, почему её сейчас нет. */
  inviteTelegram(): Promise<TelegramInvite | InviteRefusal>;
  /** Чем кончилось ожидание бота. */
  inviteState(code: string): Promise<InviteState>;
  /** Ссылка, которой человек забирает СЕБЯ на второе устройство. */
  transferLink(): string | undefined;
  /** Положить строку в буфер обмена, если браузер это умеет. */
  copy(text: string): Promise<boolean>;
}

/** Дверь в настоящие аккаунты (`@crossade/wire`). */
export const liveGateway: ProfileGateway = {
  read: () => myProfile(),
  identify: async () => {
    await ensureAccount();
  },
  async save(patch) {
    const account = await updateProfile(patch);
    return account ? myProfile() : undefined;
  },
  telegramInitData: () => {
    const initData = (globalThis as { Telegram?: { WebApp?: { initData?: unknown } } }).Telegram?.WebApp?.initData;
    return typeof initData === "string" && initData.length > 0 ? initData : undefined;
  },
  async linkTelegram(initData) {
    return (await linkTelegram(initData))?.kind;
  },
  inviteTelegram: () => telegramInvite(),
  inviteState: (code) => telegramInviteState(code),
  transferLink: () => {
    const code = storedAccount()?.recoveryHash;
    return code ? transferLinkFor(code, globalThis.location.href) : undefined;
  },
  async copy(text) {
    try {
      await globalThis.navigator?.clipboard?.writeText(text);
      return true;
    } catch {
      // Буфер закрыт (не тот протокол, отказ в правах) — ссылка всё равно на экране, её видно.
      return false;
    }
  },
};

export interface HomeProfileOptions {
  readonly look?: Partial<HomeLook> | undefined;
  /** Где экран берёт введённую строку. По умолчанию — окно ввода браузера. */
  readonly ask?: Ask | undefined;
  readonly gateway?: ProfileGateway | undefined;
  /** Шапка стала другой высоты — полка под ней начинается ниже. */
  readonly onHeight?: ((px: number) => void) | undefined;
}

export interface HomeProfile {
  readonly element: HTMLElement;
  /** Перечитать профиль с сервера — имя могло смениться на другом устройстве. */
  refresh(): Promise<void>;
  /** Насколько шапка съедает верх экрана, чёлка включена. */
  height(): number;
  stop(): void;
}

/** Поднять первую страницу над `container`. Возврат снимает её целиком. */
export function homeProfile(container: HTMLElement, o: HomeProfileOptions = {}): HomeProfile {
  const look = homeLook(o.look);
  const ask = o.ask ?? askInWindow;
  const gate = o.gateway ?? liveGateway;

  let profile: Profile | undefined;
  let open = false;
  /** Показана ли ссылка переноса. Пока не попросили — её на экране нет. */
  let linkShown = false;
  /** Что сказать человеку после действия, которое не видно по экрану. */
  let said = "";
  /** Ссылка в бота, пока её ждут. */
  let invite: TelegramInvite | undefined;
  /** Опрос сервера, пока человек в телеге. Снимается, когда ждать больше нечего. */
  let waiting: (() => void) | undefined;
  let stopped = false;

  const element = document.createElement("div");
  element.className = "crossade-home";
  // ВО ВЕСЬ ЭКРАН, НО СКВОЗНОЙ. Лист профиля выезжает снизу и обязан мерить себя по всему стеклу;
  // обёртка высотой в одну шапку дала бы ему высоту шапки. Ловят касания только сам профиль и
  // открытый лист — остальная площадь принадлежит полке под ней.
  element.style.cssText = "position:absolute;inset:0;z-index:9;pointer-events:none";
  container.appendChild(element);

  const headHtml = (): string => {
    if (!profile || look.profile === "none") {
      return `<div data-g="head" style="${headBandCss(look, "env(safe-area-inset-top, 0px)")}"><div style="height:${look.height}px"></div></div>`;
    }
    const me = whoAmI(profile);
    const words =
      look.profile === "avatar"
        ? ""
        : `<span style="display:flex;flex-direction:column;line-height:1.1;min-width:0">` +
          `<span style="font:400 ${Math.max(11, Math.round(look.avatar * 0.42))}px ${FONT};color:${PALETTE.ink};` +
          `white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(me.name)}</span>` +
          (look.profile === "avatar+name+note" && me.note
            ? `<span style="font:400 ${Math.max(8, Math.round(look.avatar * 0.3))}px ${FONT};color:${me.named ? PALETTE.inkDim : PALETTE.gold}">${esc(me.note)}</span>`
            : "") +
          `</span>`;
    const row =
      `display:flex;align-items:center;justify-content:${look.profileSide === "left" ? "flex-start" : "flex-end"};` +
      `height:${look.height}px;padding:0 ${look.side}px;box-sizing:border-box`;
    return (
      `<div data-g="head" style="${headBandCss(look, "env(safe-area-inset-top, 0px)")}"><div style="${row}">` +
      `<div data-g="profile" role="button" tabindex="0" style="display:flex;align-items:center;gap:${Math.max(6, look.gap)}px;` +
      `cursor:pointer;min-width:0;pointer-events:auto">${ballHtml(me.face, me.ink, look.avatar, me.named ? 2 : 0)}${words}</div>` +
      `</div></div>`
    );
  };

  const screenHtml = (): string => {
    if (!open || !profile) return "";
    const me = whoAmI(profile);
    const sheet = look.sheet === "bottom";
    const r = look.radius;
    const body =
      `<div style="display:flex;flex-direction:column;padding:0 18px 22px">` +
      // КТО Я — крупно и первым: экран открывают, ткнув в себя, и первым должен стоять ответ.
      `<div style="display:flex;align-items:center;gap:14px;padding:6px 0 16px">` +
      ballHtml(me.face, me.ink, look.avatarBig, me.named ? 3 : 0) +
      `<div style="display:flex;flex-direction:column;gap:4px;min-width:0">` +
      `<span style="font:400 19px ${FONT};color:${PALETTE.ink};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(me.name)}</span>` +
      (me.note
        ? `<span style="font:400 12px ${FONT};color:${me.named ? PALETTE.inkDim : PALETTE.gold}">${esc(me.note)}</span>`
        : "") +
      `</div></div>` +
      lineHtml(
        labelHtml("Имя") +
          valueHtml(me.name) +
          buttonHtml("name", me.nameAction === "invite" ? "Назваться" : "Сменить", me.nameAction === "invite" ? "gold" : "plain", r),
        true,
      ) +
      lineHtml(
        labelHtml("Аватар") +
          `<div style="display:flex;gap:8px">` +
          buttonHtml("emoji", profile.avatar ? "Сменить эмодзи" : "Эмодзи", "plain", r) +
          buttonHtml("picture", "Картинка", "quiet", r) +
          `</div>`,
        true,
      ) +
      lineHtml(
        `<div style="display:flex;flex-direction:column;gap:9px;width:100%">${labelHtml("Любимый цвет")}` +
          `<div style="display:flex;gap:8px;flex-wrap:wrap">${swatchesHtml(FAVOURITE_INKS, profile.color)}</div></div>`,
        true,
      ) +
      telegramLine(me.hasTelegram, r) +
      transferLine(r) +
      (said ? `<div style="font:400 13px ${FONT};color:${PALETTE.gold};padding-top:12px;line-height:1.5">${esc(said)}</div>` : "") +
      `</div>`;
    return (
      `<div data-g="screen" style="position:absolute;inset:0;z-index:20;pointer-events:auto;display:flex;flex-direction:column;` +
      `justify-content:${sheet ? "flex-end" : "stretch"};background:${tint(PALETTE.black, sheet ? 0.55 : 0)}">` +
      `<div style="background:${PALETTE.felt};box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.panel};` +
      (sheet
        ? `border-radius:${r + 10}px ${r + 10}px 0 0;max-height:${Math.round(look.sheetShare * 100)}%;`
        : `flex:1;padding-top:env(safe-area-inset-top, 0px);`) +
      `overflow:auto">` +
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px 8px">` +
      `<span style="font:400 16px ${FONT};color:${PALETTE.gold};letter-spacing:.08em">ПРОФИЛЬ</span>` +
      buttonHtml("close", "Закрыть", "quiet", r) +
      `</div>${body}</div></div>`
    );
  };

  /**
   * ТЕЛЕГРАМ. Кнопка есть только там, где эту дверь действительно можно открыть — внутри Mini App,
   * где телега сама подписывает, кто пришёл. В обычном браузере вход через телегу идёт обратным
   * потоком (код в боте), и он ещё не построен: мёртвая кнопка хуже её отсутствия.
   */
  /**
   * ТЕЛЕГРАМ — ДВЕ РАЗНЫЕ ДВЕРИ, И ОБЕ НАСТОЯЩИЕ.
   *
   * В Mini App телега уже подписала, кто пришёл (`initData`) — привязка мгновенная. В обычном
   * браузере наоборот: не мы ищем человека в телеге (бот не может — ни по номеру, ни по
   * @username), а он открывает бота по ссылке, и телега сама говорит боту, кто он.
   *
   * Ссылка появляется только тогда, когда сервер её дал: не настроен бот или общий секрет — путь
   * не предлагается вовсе, потому что кнопка без двери за ней хуже её отсутствия.
   */
  const telegramLine = (linked: boolean, r: number): string => {
    if (linked) return lineHtml(labelHtml("Telegram") + valueHtml("привязан"), true);
    if (gate.telegramInitData()) {
      return lineHtml(labelHtml("Telegram") + buttonHtml("tg", "Привязать", "gold", r), true);
    }
    if (invite) {
      return lineHtml(
        `<div style="display:flex;flex-direction:column;gap:9px;width:100%">` +
          labelHtml("Telegram") +
          `<span style="font:400 12px ${FONT};color:${PALETTE.inkDim};line-height:1.5">` +
          `Открой бота и нажми «Запустить» — вернёшься сюда уже собой. Ссылка живёт пять минут.</span>` +
          `<a data-g="tg-link" href="${esc(invite.link)}" target="_blank" rel="noreferrer" ` +
          `style="font:400 13px ${FONT};color:${PALETTE.gold};word-break:break-all">${esc(invite.link)}</a>` +
          `<div style="display:flex;gap:8px">${buttonHtml("tg-open", "Открыть бота", "gold", r)}${buttonHtml("tg-cancel", "Отмена", "quiet", r)}</div>` +
          `</div>`,
        true,
      );
    }
    return lineHtml(labelHtml("Telegram") + buttonHtml("tg-invite", "Привязать", "gold", r), true);
  };

  /**
   * ПЕРЕНОС СЕБЯ — ССЫЛКОЙ, А НЕ КОДОМ. Вводить код некуда и не во что: экрана ввода у нас нет, а
   * ссылку открывают, и второе устройство становится тобой само.
   *
   * ЭТО «ЗАБЕРИ СЕБЯ», А НЕ «ПОЗОВИ ДРУГА»: открывший её становится тобой — с твоим именем, твоими
   * столами и твоими предметами. Текст рядом обязан это сказать, иначе её перешлют в чат.
   */
  const transferLine = (r: number): string => {
    const link = gate.transferLink();
    return lineHtml(
      `<div style="display:flex;flex-direction:column;gap:7px;width:100%">` +
        labelHtml("Открыть на другом устройстве") +
        `<span style="font:400 12px ${FONT};color:${PALETTE.inkDim};line-height:1.5">` +
        `Ссылка переносит СЕБЯ, а не приглашает: открой её на своём втором устройстве и никому не отправляй.</span>` +
        (linkShown && link
          ? `<span data-g="link" style="font:400 13px ${FONT};color:${PALETTE.gold};word-break:break-all;line-height:1.5">${esc(link)}</span>` +
            `<div style="display:flex;gap:8px">${buttonHtml("copy", "Скопировать", "plain", r)}${buttonHtml("hide-link", "Спрятать", "quiet", r)}</div>`
          : buttonHtml("link", "Показать ссылку", "plain", r)) +
        `</div>`,
      true,
    );
  };

  const draw = (): void => {
    if (stopped) return;
    element.innerHTML = headHtml() + screenHtml();
    o.onHeight?.(height());
    bind();
  };

  const bind = (): void => {
    const face = element.querySelector<HTMLElement>('[data-g="profile"]');
    if (face) {
      face.onclick = () => {
        open = true;
        said = "";
        draw();
      };
    }
    for (const button of element.querySelectorAll<HTMLElement>("[data-do]")) {
      button.onclick = () => void act(button.getAttribute("data-do") ?? "");
    }
  };

  const save = async (patch: { name?: string; color?: string; avatar?: string }): Promise<void> => {
    const updated = await gate.save(patch);
    if (updated) profile = updated;
    else said = "Не записалось — сервер не ответил.";
    draw();
  };

  const act = async (does: string): Promise<void> => {
    if (does.startsWith("color:")) return save({ color: does.slice("color:".length) });
    switch (does) {
      case "close":
        open = false;
        linkShown = false;
        said = "";
        // ЗАКРЫЛИ ЭКРАН — ПЕРЕСТАЛИ ЖДАТЬ: ожидание принадлежит открытому экрану, а не вкладке.
        stopWatching();
        invite = undefined;
        return draw();
      case "name": {
        const got = await ask("Как тебя звать?", profile?.nameChosen ? (profile?.name ?? "") : "");
        if (got) await save({ name: got });
        return;
      }
      case "emoji": {
        const got = await ask("Эмодзи для аватара", profile?.avatar ?? "");
        if (got !== undefined) await save({ avatar: got });
        return;
      }
      case "picture": {
        // АВАТАР — ЭТО СТРОКА: эмодзи или ссылка на картинку. Загрузки файлов у нас ещё нет, и
        // рисовать кнопку, за которой её нет, значит обещать.
        const got = await ask("Ссылка на картинку", profile?.avatar ?? "");
        if (got !== undefined) await save({ avatar: got });
        return;
      }
      case "tg": {
        const initData = gate.telegramInitData();
        if (!initData) return;
        const kind = await gate.linkTelegram(initData);
        // ДВА ПОЛНОЦЕННЫХ АККАУНТА НЕ СЛИВАЮТСЯ НИКОГДА — человеку так и говорят, а не молчат.
        said =
          kind === "conflict"
            ? "Этот Telegram уже принадлежит другому аккаунту. Войди им — или отвяжи там."
            : kind === "switch"
              ? "Это твой аккаунт — вернули тебя в него."
              : kind === "linked"
                ? ""
                : "Не вышло привязать.";
        profile = (await gate.read()) ?? profile;
        return draw();
      }
      case "tg-invite": {
        const asked = await gate.inviteTelegram();
        // ПОЧЕМУ ССЫЛКИ НЕТ — говорится по-разному: на «не настроено» жать бесполезно, на «слишком
        // часто» надо просто подождать. Одна фраза на оба случая отправляет человека по кругу.
        invite = typeof asked === "string" ? undefined : asked;
        said =
          asked === "not-configured"
            ? "Привязка через бота сейчас не настроена."
            : asked === "too-soon"
              ? "Только что уже просили — подожди полминуты."
              : asked === "offline"
                ? "Сервер не ответил. Попробуй ещё раз."
                : "";
        watchInvite();
        return draw();
      }
      case "tg-open": {
        // Открываем сами же ту ссылку, что показана рядом: на телефоне она уводит в приложение, на
        // маке — в телегу или в веб-версию, и в обоих случаях это одно и то же место.
        if (invite) globalThis.open?.(invite.link, "_blank", "noreferrer");
        return;
      }
      case "tg-cancel":
        stopWatching();
        invite = undefined;
        said = "";
        return draw();
      case "link":
        linkShown = true;
        said = "";
        return draw();
      case "hide-link":
        linkShown = false;
        return draw();
      case "copy": {
        const link = gate.transferLink();
        said = link && (await gate.copy(link)) ? "Ссылка скопирована." : "Скопировать не вышло — она на экране, перепиши глазами.";
        return draw();
      }
      default:
        return;
    }
  };

  const height = (): number => {
    const head = element.querySelector<HTMLElement>('[data-g="head"]');
    return head ? Math.round(head.getBoundingClientRect().height) : 0;
  };

  const stopWatching = (): void => {
    waiting?.();
    waiting = undefined;
  };

  /**
   * ПОКА ЧЕЛОВЕК В ТЕЛЕГЕ, СТРАНИЦА СПРАШИВАЕТ СЕРВЕР. Опрос, а не сокет: ждать тут нечего, кроме
   * одного ответа, и ради него держать соединение открытым незачем.
   *
   * Опрос СНИМАЕТСЯ на любом исходе, включая «ссылка устарела», — иначе вкладка, забытая открытой,
   * будет стучать в сервер до конца дня.
   */
  const watchInvite = (): void => {
    stopWatching();
    const code = invite?.code;
    if (!code) return;
    waiting = every(WATCH_EVERY_MS, () => {
      void (async () => {
        const state: InviteState = await gate.inviteState(code);
        if (state === "waiting") return;
        stopWatching();
        invite = undefined;
        said =
          state === "conflict"
            ? "Этот Telegram уже принадлежит другому аккаунту. Войди им — или отвяжи там."
            : state === "switch"
              ? "Это твой аккаунт — вернули тебя в него."
              : state === "expired"
                ? "Ссылка устарела. Нажми «Привязать» ещё раз."
                : "";
        profile = (await gate.read()) ?? profile;
        draw();
      })();
    });
  };

  /**
   * ПЕРЕЧИТАТЬ, КТО ЭТО. Пусто — значит этого человека сервер не знает: сохранённый аккаунт
   * забыт (`myProfile`), и вместо пустого угла браузеру заводится новый гость. Ровно один
   * повтор: сервер, который молчит, молчит и на второй заход, а страница должна подняться и без
   * него.
   */
  const refresh = async (): Promise<void> => {
    profile = await gate.read();
    if (!profile) {
      await gate.identify();
      profile = await gate.read();
    }
    draw();
  };

  draw();
  void refresh();

  return {
    element,
    refresh,
    height,
    stop() {
      stopped = true;
      stopWatching();
      element.remove();
    },
  };
}
