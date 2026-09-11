// @vitest-environment jsdom
// ЭКРАН ПРОФИЛЯ КАК ДОКУМЕНТ: что он показывает, что записывает и чего не обещает.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@crossade/wire";
import { homeProfile, type ProfileGateway } from "./home.js";

const GUEST: Profile = {
  id: "acc-1",
  name: "Золотой таракан",
  nameChosen: false,
  createdAt: 1700000000000,
  color: null,
  avatar: null,
  identities: [],
};

function gatewayOf(profile: Profile, over: Partial<ProfileGateway> = {}) {
  let current = profile;
  const saved: Record<string, string>[] = [];
  const gate: ProfileGateway = {
    read: async () => current,
    identify: async () => {},
    async save(patch) {
      saved.push(patch as Record<string, string>);
      current = { ...current, ...patch, ...(patch.name ? { nameChosen: true } : {}) } as Profile;
      return current;
    },
    telegramInitData: () => undefined,
    linkTelegram: async () => "linked",
    unlinkTelegram: async () => true,
    inviteTelegram: async () => ({ code: "CODE", link: "https://t.me/crossade_bot?start=CODE", expiresInMs: 300000 }),
    inviteState: async () => "waiting",
    transferLink: () => "http://hub.test/?restore=BOVAKI",
    copy: async () => true,
    ...over,
  };
  return { gate, saved, now: () => current };
}

let container: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = "";
  container = document.createElement("div");
  document.body.appendChild(container);
});

const q = (root: HTMLElement, sel: string) => root.querySelector<HTMLElement>(sel);
const settle = () => new Promise((r) => setTimeout(r, 0));

async function openScreen(gate: ProfileGateway, ask = vi.fn(async () => "Ербол")) {
  const home = homeProfile(container, { gateway: gate, ask });
  await settle();
  q(home.element, '[data-g="profile"]')!.click();
  return { home, ask };
}

describe("экран профиля", () => {
  it("открывается тапом по себе и больше ниоткуда", async () => {
    const { gate } = gatewayOf(GUEST);
    const home = homeProfile(container, { gateway: gate });
    await settle();

    expect(q(home.element, '[data-g="screen"]')).toBeNull();
    q(home.element, '[data-g="profile"]')!.click();
    expect(q(home.element, '[data-g="screen"]')).not.toBeNull();
    home.stop();
  });

  it("гостю кнопка имени горит золотом, назвавшемуся — обычная", async () => {
    const guest = gatewayOf(GUEST);
    const one = await openScreen(guest.gate);
    expect(q(one.home.element, '[data-do="name"]')!.textContent).toBe("Назваться");
    one.home.stop();

    const named = gatewayOf({ ...GUEST, name: "Ербол", nameChosen: true });
    const two = await openScreen(named.gate);
    expect(q(two.home.element, '[data-do="name"]')!.textContent).toBe("Сменить");
    two.home.stop();
  });

  it("имя спрашивается у внешнего слоя и записывается как есть", async () => {
    const { gate, saved } = gatewayOf(GUEST);
    const ask = vi.fn(async () => "Ербол");
    const { home } = await openScreen(gate, ask);

    q(home.element, '[data-do="name"]')!.click();
    await settle();

    expect(ask).toHaveBeenCalledOnce();
    expect(saved).toEqual([{ name: "Ербол" }]);
    // Назвался — и экран перестал предлагать назваться.
    expect(q(home.element, '[data-do="name"]')!.textContent).toBe("Сменить");
    home.stop();
  });

  it("отказ от ввода ничего не записывает", async () => {
    const { gate, saved } = gatewayOf(GUEST);
    const ask = vi.fn(async () => undefined);
    const { home } = await openScreen(gate, ask as never);

    q(home.element, '[data-do="name"]')!.click();
    await settle();

    expect(saved).toEqual([]);
    home.stop();
  });

  it("цвет записывается тем значением, что нарисовано на кружке", async () => {
    const { gate, saved } = gatewayOf(GUEST);
    const { home } = await openScreen(gate);

    const swatch = q(home.element, '[data-do^="color:"]')!;
    swatch.click();
    await settle();

    expect(saved).toEqual([{ color: swatch.getAttribute("data-do")!.slice("color:".length) }]);
    home.stop();
  });

  it("ссылка переноса не лежит на экране заранее — её показывают по просьбе", async () => {
    const { gate } = gatewayOf(GUEST);
    const { home } = await openScreen(gate);

    expect(q(home.element, '[data-g="link"]')).toBeNull();
    q(home.element, '[data-do="link"]')!.click();
    expect(q(home.element, '[data-g="link"]')!.textContent).toBe("http://hub.test/?restore=BOVAKI");
    // ...и прячется, когда экран закрыли: ссылка на чужом экране — это чужой аккаунт.
    q(home.element, '[data-do="close"]')!.click();
    q(home.element, '[data-g="profile"]')!.click();
    expect(q(home.element, '[data-g="link"]')).toBeNull();
    home.stop();
  });

  it("рядом со ссылкой сказано, что она переносит СЕБЯ, а не приглашает", async () => {
    // Без этой строки её перешлют в чат, и переславший отдаст свой аккаунт.
    const { gate } = gatewayOf(GUEST);
    const { home } = await openScreen(gate);

    expect(home.element.textContent).toContain("переносит СЕБЯ");
    expect(home.element.textContent).toContain("никому не отправляй");
    home.stop();
  });

  it("копирование кладёт в буфер ту же ссылку, что на экране", async () => {
    const { gate } = gatewayOf(GUEST);
    const copy = vi.spyOn(gate, "copy");
    const { home } = await openScreen(gate);

    q(home.element, '[data-do="link"]')!.click();
    q(home.element, '[data-do="copy"]')!.click();
    await settle();

    expect(copy).toHaveBeenCalledWith("http://hub.test/?restore=BOVAKI");
    expect(home.element.textContent).toContain("скопирована");
    home.stop();
  });
});

describe("home.no-button-without-a-door-behind-it", () => {
  it("вне Mini App привязка идёт через бота, и это другая кнопка", async () => {
    // Mini App подписывает человека сама; браузер — наоборот: человек идёт в бота, и телега там
    // говорит боту, кто он. Две разные двери, и мгновенной кнопки в браузере быть не может.
    const { gate } = gatewayOf(GUEST);
    const { home } = await openScreen(gate);

    expect(q(home.element, '[data-do="tg"]')).toBeNull();
    expect(q(home.element, '[data-do="tg-invite"]')).not.toBeNull();
    home.stop();
  });

  it("сервер ссылки не дал — человеку говорят, а не показывают мёртвую ссылку", async () => {
    const { gate } = gatewayOf(GUEST, { inviteTelegram: async () => "not-configured" });
    const { home } = await openScreen(gate);

    q(home.element, '[data-do="tg-invite"]')!.click();
    await settle();

    expect(q(home.element, '[data-g="tg-link"]')).toBeNull();
    expect(home.element.textContent).toContain("не настроена");
    home.stop();
  });

  // ПОЧЕМУ ССЫЛКИ НЕТ — РАЗНЫЕ ВЕЩИ. «Не настроено» значит жать бесполезно; «слишком часто» —
  // подождать полминуты. Одна фраза на оба случая гоняет человека по кругу.
  it.each([
    ["too-soon", "подожди"],
    ["offline", "не ответил"],
  ])("отказ «%s» объясняется своими словами", async (refusal, said) => {
    const { gate } = gatewayOf(GUEST, { inviteTelegram: async () => refusal as never });
    const { home } = await openScreen(gate);

    q(home.element, '[data-do="tg-invite"]')!.click();
    await settle();

    expect(home.element.textContent).toContain(said);
    expect(home.element.textContent).not.toContain("не настроена");
    home.stop();
  });

  it("внутри Mini App кнопка есть и привязывает", async () => {
    const { gate } = gatewayOf(GUEST, { telegramInitData: () => "signed-by-telegram" });
    const link = vi.spyOn(gate, "linkTelegram");
    const { home } = await openScreen(gate);

    q(home.element, '[data-do="tg"]')!.click();
    await settle();

    expect(link).toHaveBeenCalledWith("signed-by-telegram");
    home.stop();
  });

  it("чужая телега — человеку говорят прямо, а не молчат", async () => {
    const { gate } = gatewayOf(GUEST, {
      telegramInitData: () => "signed-by-telegram",
      linkTelegram: async () => "conflict",
    });
    const { home } = await openScreen(gate);

    q(home.element, '[data-do="tg"]')!.click();
    await settle();

    expect(home.element.textContent).toContain("уже принадлежит другому аккаунту");
    home.stop();
  });
});

// СТОРОЖ `home.waiting-for-the-bot-ends`.
//
// Страница ждёт человека, ушедшего в телегу, опросом. Ожидание, которое не снимается, — это вкладка,
// стучащая в сервер до конца дня; поэтому оно кончается на ЛЮБОМ исходе и на закрытии экрана.
describe("home.waiting-for-the-bot-ends", () => {
  const withInvite = (state: () => Promise<"waiting" | "linked" | "switch" | "conflict" | "expired">) =>
    gatewayOf(GUEST, { inviteState: vi.fn(state) });

  it("ссылка в бота показывается по нажатию", async () => {
    const { gate } = gatewayOf(GUEST);
    const { home } = await openScreen(gate);

    q(home.element, '[data-do="tg-invite"]')!.click();
    await settle();

    expect(q(home.element, '[data-g="tg-link"]')!.getAttribute("href")).toBe("https://t.me/crossade_bot?start=CODE");
    home.stop();
  });

  it("бот подтвердил — ожидание снимается, и больше сервер никто не дёргает", async () => {
    vi.useFakeTimers();
    let state: "waiting" | "linked" = "waiting";
    const { gate } = withInvite(async () => state);
    const home = homeProfile(container, { gateway: gate });
    await vi.advanceTimersByTimeAsync(0);
    q(home.element, '[data-g="profile"]')!.click();
    q(home.element, '[data-do="tg-invite"]')!.click();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(2000);
    expect(gate.inviteState).toHaveBeenCalled();

    state = "linked";
    await vi.advanceTimersByTimeAsync(2000);
    const asked = (gate.inviteState as ReturnType<typeof vi.fn>).mock.calls.length;

    await vi.advanceTimersByTimeAsync(10000);
    expect((gate.inviteState as ReturnType<typeof vi.fn>).mock.calls.length).toBe(asked);
    expect(q(home.element, '[data-g="tg-link"]')).toBeNull();
    home.stop();
    vi.useRealTimers();
  });

  it("ссылка устарела — так и сказано, и ожидание снято", async () => {
    vi.useFakeTimers();
    const { gate } = withInvite(async () => "expired");
    const home = homeProfile(container, { gateway: gate });
    await vi.advanceTimersByTimeAsync(0);
    q(home.element, '[data-g="profile"]')!.click();
    q(home.element, '[data-do="tg-invite"]')!.click();
    await vi.advanceTimersByTimeAsync(2000);

    expect(home.element.textContent).toContain("устарела");
    const asked = (gate.inviteState as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect((gate.inviteState as ReturnType<typeof vi.fn>).mock.calls.length).toBe(asked);
    home.stop();
    vi.useRealTimers();
  });

  it("закрыли экран — перестали ждать: ожидание принадлежит экрану, а не вкладке", async () => {
    vi.useFakeTimers();
    const { gate } = withInvite(async () => "waiting");
    const home = homeProfile(container, { gateway: gate });
    await vi.advanceTimersByTimeAsync(0);
    q(home.element, '[data-g="profile"]')!.click();
    q(home.element, '[data-do="tg-invite"]')!.click();
    await vi.advanceTimersByTimeAsync(2000);

    q(home.element, '[data-do="close"]')!.click();
    const asked = (gate.inviteState as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);

    expect((gate.inviteState as ReturnType<typeof vi.fn>).mock.calls.length).toBe(asked);
    home.stop();
    vi.useRealTimers();
  });
});

// СТОРОЖ `home.an-unknown-account-does-not-leave-a-blank-corner`.
//
// В браузере лежит только id: сам человек живёт на сервере. Сервер, который отвечает «такого нет»,
// оставлял страницу пустой навсегда — профиля нет, а завести новый мешает сохранённый id.
describe("home.an-unknown-account-does-not-leave-a-blank-corner", () => {
  it("сервер не знает сохранённого — браузеру заводится новый гость, и угол не пустует", async () => {
    let known: Profile | undefined;
    const identify = vi.fn(async () => {
      known = GUEST;
    });
    const { gate } = gatewayOf(GUEST, { read: async () => known, identify });

    const home = homeProfile(container, { gateway: gate });
    await settle();
    await settle();

    expect(identify).toHaveBeenCalledOnce();
    expect(q(home.element, '[data-g="profile"]')).not.toBeNull();
    home.stop();
  });

  it("сервер молчит — пробуем один раз и поднимаемся без него", async () => {
    const identify = vi.fn(async () => {});
    const { gate } = gatewayOf(GUEST, { read: async () => undefined, identify });

    const home = homeProfile(container, { gateway: gate });
    await settle();
    await settle();

    expect(identify).toHaveBeenCalledOnce();
    expect(q(home.element, '[data-g="head"]')).not.toBeNull();
    home.stop();
  });
});

describe("шапка первой страницы", () => {
  it("говорит, что имя выдал стол, — это единственное приглашение назваться", async () => {
    const { gate } = gatewayOf(GUEST);
    const home = homeProfile(container, { gateway: gate });
    await settle();

    expect(q(home.element, '[data-g="head"]')!.textContent).toContain("имя выдал стол");
    home.stop();
  });

  it("снимается без остатка", async () => {
    const { gate } = gatewayOf(GUEST);
    const home = homeProfile(container, { gateway: gate });
    await settle();
    home.stop();
    expect(container.querySelector(".crossade-home")).toBeNull();
  });
});

// ПРИВЯЗАННОЕ СОСТОЯНИЕ — ПО СТЕНДУ: видно, ЧТО именно привязано, и дверь можно закрыть.
describe("home.a-linked-door-shows-whose-it-is", () => {
  const LINKED: Profile = {
    ...GUEST,
    name: "Ербол",
    nameChosen: true,
    identities: [{ provider: "telegram", label: "@erbol" }],
  };

  it("в строке стоит @имя, а не безликое «привязан»", async () => {
    const { gate } = gatewayOf(LINKED);
    const { home } = await openScreen(gate);

    expect(home.element.textContent).toContain("@erbol");
    expect(q(home.element, '[data-do="tg-invite"]')).toBeNull();
    home.stop();
  });

  it("телега без @username — «привязан», потому что подписи и правда нет", async () => {
    const { gate } = gatewayOf({ ...LINKED, identities: [{ provider: "telegram", label: null }] });
    const { home } = await openScreen(gate);

    expect(home.element.textContent).toContain("привязан");
    home.stop();
  });

  it("дверь закрывается отсюда же, и человек остаётся собой", async () => {
    const { gate } = gatewayOf(LINKED);
    const off = vi.spyOn(gate, "unlinkTelegram");
    const { home } = await openScreen(gate);

    q(home.element, '[data-do="tg-off"]')!.click();
    await settle();

    expect(off).toHaveBeenCalledOnce();
    expect(home.element.textContent).toContain("код переноса на месте");
    home.stop();
  });
});
