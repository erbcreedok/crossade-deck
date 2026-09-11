// СТОРОЖ `home.the-nickname-is-the-invitation`.
//
// Первая страница держится на том, что выданная столом кличка ВИДНА как выданная: это единственное
// приглашение назваться, которое у нас есть, — кнопки входа на первой странице нет.

import { describe, expect, it } from "vitest";
import type { Profile } from "@crossade/wire";
import { whoAmI } from "./whoami.js";

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: "acc-1",
  name: "Золотой таракан",
  nameChosen: false,
  createdAt: 1700000000000,
  color: null,
  avatar: null,
  identities: [],
  ...over,
});

describe("home.the-nickname-is-the-invitation", () => {
  it("на госте кличка: подпись говорит, откуда имя, а кнопка зовёт назваться", () => {
    const me = whoAmI(profile());
    expect(me.named).toBe(false);
    expect(me.note).toBe("имя выдал стол");
    expect(me.nameAction).toBe("invite");
  });

  it("назвался — кнопка просто меняет имя, и про стол больше ни слова", () => {
    const me = whoAmI(profile({ name: "Ербол", nameChosen: true }));
    expect(me.nameAction).toBe("change");
    expect(me.note).not.toContain("стол");
  });

  it("у безымянного лица нет — силуэт, а не буква клички", () => {
    // Буква выданного слова читается как инициал: человек узнаёт в ней себя, и приглашение
    // назваться пропадает.
    expect(whoAmI(profile()).face).toEqual({ kind: "nobody" });
  });

  it("назвался — в кружке его буква", () => {
    expect(whoAmI(profile({ name: "Ербол", nameChosen: true })).face).toEqual({ kind: "letter", letter: "Е" });
  });

  it("выбрал эмодзи — оно и стоит, назвался он или нет", () => {
    expect(whoAmI(profile({ avatar: "🐙" })).face).toEqual({ kind: "emoji", emoji: "🐙" });
    expect(whoAmI(profile({ avatar: "🐙", nameChosen: true })).face).toEqual({ kind: "emoji", emoji: "🐙" });
  });

  it("цвет — только выбранный, выдуманного по умолчанию нет", () => {
    expect(whoAmI(profile()).ink).toBeNull();
    expect(whoAmI(profile({ color: "#f2c14e" })).ink).toBe("#f2c14e");
  });

  it("вошедший через телегу — не гость, и подписи «гость» на нём нет", () => {
    const me = whoAmI(profile({ name: "Ербол", nameChosen: true, identities: ["telegram"] }));
    expect(me.hasTelegram).toBe(true);
    expect(me.note).toBe("");
  });

  it("назвался, но дверей нет — так и написано: гость", () => {
    expect(whoAmI(profile({ name: "Ербол", nameChosen: true })).note).toBe("гость");
  });
});
