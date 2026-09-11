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
    myCode: () => "BOVAKI",
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

  it("код переноса не лежит на экране заранее — его показывают по просьбе", async () => {
    const { gate } = gatewayOf(GUEST);
    const { home } = await openScreen(gate);

    expect(q(home.element, '[data-g="code"]')).toBeNull();
    q(home.element, '[data-do="code"]')!.click();
    expect(q(home.element, '[data-g="code"]')!.textContent).toBe("BOVAKI");
    // ...и прячется, когда экран закрыли: код на чужом экране — это чужой аккаунт.
    q(home.element, '[data-do="close"]')!.click();
    q(home.element, '[data-g="profile"]')!.click();
    expect(q(home.element, '[data-g="code"]')).toBeNull();
    home.stop();
  });
});

describe("home.no-button-without-a-door-behind-it", () => {
  it("вне Mini App кнопки «Привязать» нет — обратный поток ещё не построен", async () => {
    const { gate } = gatewayOf(GUEST);
    const { home } = await openScreen(gate);

    expect(q(home.element, '[data-do="tg"]')).toBeNull();
    expect(home.element.textContent).toContain("не привязан");
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
