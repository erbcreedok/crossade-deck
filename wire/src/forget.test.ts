// @vitest-environment jsdom
// СТОРОЖ `wire.404-means-this-account-is-gone`.
//
// В браузере лежит только id и код — сам человек живёт на сервере. «Такого нет» это ОТВЕТ, и
// держаться за id, который сервер не признаёт, значит запереть экран: профиля не будет, а завести
// новый мешает та же запись. Обрыв сети ответом не является — там мы не знаем ничего.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { myProfile, storedAccount } from "./account.js";

const ACCOUNT = { id: "acc-1", name: "Золотой таракан", recoveryHash: "BOVAKI" };

beforeEach(() => {
  localStorage.setItem("crossade.account", JSON.stringify(ACCOUNT));
});

describe("wire.404-means-this-account-is-gone", () => {
  it("сервер отвечает «такого нет» — браузер забывает, кем себя считал", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));

    expect(await myProfile()).toBeUndefined();
    expect(storedAccount()).toBeUndefined();
  });

  it("сервер упал — держимся за себя: это не ответ", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));

    expect(await myProfile()).toBeUndefined();
    expect(storedAccount()?.id).toBe(ACCOUNT.id);
  });

  it("сети нет — тоже держимся", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    expect(await myProfile()).toBeUndefined();
    expect(storedAccount()?.id).toBe(ACCOUNT.id);
  });

  it("сервер знает — профиль приходит, и никто ничего не забывает", async () => {
    const profile = { id: ACCOUNT.id, name: "Ербол", nameChosen: true, createdAt: 1, color: null, avatar: null, identities: [] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => profile })));

    expect((await myProfile())?.name).toBe("Ербол");
    expect(storedAccount()?.id).toBe(ACCOUNT.id);
  });
});
