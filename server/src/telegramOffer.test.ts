// СТОРОЖ `telegram-offer.one-question-at-a-time`.
//
// Стенд решил это раньше кода: два вопроса разом читаются как «прими всё или ничего», а человек
// чаще хочет чужое имя и своё лицо. И спрашивать того, у кого своего нет вовсе, незачем — отказ
// оставил бы его с кличкой, которую он и пришёл менять.

import { describe, expect, it } from "vitest";
import { offerFor } from "./telegramOffer.js";
import type { Account } from "./accounts.js";
import type { Identity } from "./db/accountsRepo.js";

const account = (over: Partial<Account> = {}): Account => ({
  id: "acc-1",
  name: "Золотой таракан",
  nameChosen: false,
  recoveryHash: "BOVAKI",
  createdAt: 1,
  ...over,
});

const door = (over: Partial<Identity> = {}): Identity => ({
  provider: "telegram",
  subject: "70001",
  label: "@erbol",
  offeredName: "Ербол",
  offeredPhoto: "https://t.me/photo.jpg",
  declinedName: false,
  declinedPhoto: false,
  verifiedAt: 1,
  ...over,
});

describe("telegram-offer.one-question-at-a-time", () => {
  it("своего нет вовсе — берём молча, вопросов не задаём", () => {
    const one = offerFor(account(), door(), false);
    expect(one.silent).toBe(true);
    expect(one.kind).toBe("none");
    expect(one).toMatchObject({ name: "Ербол", photo: "https://t.me/photo.jpg" });
  });

  it("своё имя есть — спрашивают про имя", () => {
    const one = offerFor(account({ name: "Ерболчик", nameChosen: true }), door(), true);
    expect(one.kind).toBe("name");
    expect(one.name).toBe("Ербол");
  });

  it("в ответе едет и второе — иначе отказ от первого закрывает разговор совсем", () => {
    // «Один вопрос за раз» — про то, что СПРАШИВАЮТ. Экран, не знающий про лицо, на «оставить своё
    // имя» просто убрал бы карточку, и про аватар человека не спросили бы никогда.
    const one = offerFor(account({ name: "Ерболчик", nameChosen: true }), door(), true);
    expect(one.photo).toBe("https://t.me/photo.jpg");
  });

  it("имя уже взято — следующий вопрос про лицо", () => {
    const one = offerFor(account({ name: "Ербол", nameChosen: true }), door(), true);
    expect(one.kind).toBe("photo");
    expect(one.photo).toBe("https://t.me/photo.jpg");
  });

  it("своё лицо есть, имени своего нет — молчать нельзя, спрашиваем про имя", () => {
    const one = offerFor(account({ avatar: "🐙" }), door(), false);
    expect(one.silent).toBe(false);
    expect(one.kind).toBe("name");
  });

  it("всё уже как в телеге — спрашивать нечего", () => {
    const one = offerFor(
      account({ name: "Ербол", nameChosen: true, avatar: "https://t.me/photo.jpg" }),
      door(),
      true,
    );
    expect(one.kind).toBe("none");
    expect(one.silent).toBe(false);
  });

  it("телега ничего не дала — предлагать нечего", () => {
    const bare = door({ offeredName: null, offeredPhoto: null });
    expect(offerFor(account(), bare, false)).toEqual({ kind: "none", silent: false });
  });

  it("от чего отказались — про то не спрашивают снова", () => {
    // «Оставить своё» это решение, а не отложенный вопрос: воскресший вопрос обесценивает отказ.
    const after = door({ declinedName: true });
    const one = offerFor(account({ name: "Ерболчик", nameChosen: true }), after, true);
    expect(one.kind).toBe("photo");

    const bothDeclined = door({ declinedName: true, declinedPhoto: true });
    expect(offerFor(account({ name: "Ерболчик", nameChosen: true }), bothDeclined, true).kind).toBe("none");
  });

  it("двери нет — предложения нет", () => {
    expect(offerFor(account(), undefined, false).kind).toBe("none");
  });
});
