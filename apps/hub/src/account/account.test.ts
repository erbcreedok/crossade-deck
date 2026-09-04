// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAccount, renameAccount, restoreAccount, storedAccount, telegramAccount, type Account } from "./account.js";

describe("account management", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("storedAccount returns undefined when localStorage is empty or corrupt", () => {
    expect(storedAccount()).toBeUndefined();
    localStorage.setItem("crossade.account", "{ invalid json");
    expect(storedAccount()).toBeUndefined();
  });

  it("ensureAccount creates and stores new account when none exists", async () => {
    const fakeAccount: Account = { id: "acc-1", name: "Player", recoveryHash: "BOVAKI" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fakeAccount,
      }),
    );

    const account = await ensureAccount();
    expect(account).toEqual(fakeAccount);
    expect(storedAccount()).toEqual(fakeAccount);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("ensureAccount returns saved account without calling fetch if present", async () => {
    const fakeAccount: Account = { id: "acc-1", name: "Player", recoveryHash: "BOVAKI" };
    localStorage.setItem("crossade.account", JSON.stringify(fakeAccount));

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const account = await ensureAccount();
    expect(account).toEqual(fakeAccount);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ensureAccount returns undefined and stores nothing when server is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network Error")));

    const account = await ensureAccount();
    expect(account).toBeUndefined();
    expect(storedAccount()).toBeUndefined();
  });

  it("ensureAccount goes through /auth/telegram when Telegram initData is present", async () => {
    const fakeAccount: Account = { id: "acc-tg", name: "TG Player", recoveryHash: "TGCODE" };
    (globalThis as any).Telegram = { WebApp: { initData: "query_id=abc&user=%7B%7D&hash=deadbeef" } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => fakeAccount });
    vi.stubGlobal("fetch", fetchMock);

    const account = await ensureAccount();

    expect(account).toEqual(fakeAccount);
    expect(storedAccount()).toEqual(fakeAccount);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/auth/telegram"), expect.objectContaining({ method: "POST" }));
    delete (globalThis as any).Telegram;
  });

  it("telegramAccount posts initData and stores the returned account", async () => {
    const fakeAccount: Account = { id: "acc-tg", name: "TG Player", recoveryHash: "TGCODE" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => fakeAccount }));

    const account = await telegramAccount("query_id=abc");
    expect(account).toEqual(fakeAccount);
    expect(storedAccount()).toEqual(fakeAccount);
  });

  it("restoreAccount replaces saved account on success", async () => {
    const oldAccount: Account = { id: "acc-1", name: "OldPlayer", recoveryHash: "OLDCOD" };
    const restoredAccount: Account = { id: "acc-2", name: "RestoredPlayer", recoveryHash: "NEWCOD" };
    localStorage.setItem("crossade.account", JSON.stringify(oldAccount));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => restoredAccount,
      }),
    );

    const result = await restoreAccount("NEWCOD");
    expect(result).toEqual(restoredAccount);
    expect(storedAccount()).toEqual(restoredAccount);
  });

  it("renameAccount updates stored account on success", async () => {
    const currentAccount: Account = { id: "acc-1", name: "Player", recoveryHash: "BOVAKI" };
    const renamedAccount: Account = { id: "acc-1", name: "NewName", recoveryHash: "BOVAKI" };
    localStorage.setItem("crossade.account", JSON.stringify(currentAccount));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => renamedAccount,
      }),
    );

    const result = await renameAccount("NewName");
    expect(result).toEqual(renamedAccount);
    expect(storedAccount()).toEqual(renamedAccount);
  });
});
