// СТОРОЖ `home.the-transfer-link-never-stays-in-the-address`.
//
// Ссылка переноса несёт код восстановления. Сработавший адрес обязан стереться: код в адресной
// строке уезжает в историю, в `Referer` и в пересланную ссылку, а неверный код, оставшийся там,
// срабатывал бы заново на каждой перезагрузке.

import { describe, expect, it, vi } from "vitest";
import { codeInUrl, RESTORE_PARAM, takeOverFromUrl, transferLink, withoutCode } from "./transfer.js";

const HUB = "http://hub.test/";

describe("ссылка переноса", () => {
  it("ведёт на тот же хаб и несёт код", () => {
    const link = transferLink("BOVAKI", `${HUB}#chess?room=AB12`);
    expect(link.startsWith(HUB)).toBe(true);
    expect(codeInUrl(link)).toBe("BOVAKI");
  });

  it("не тащит с собой ни игру, ни комнату — это не приглашение за стол", () => {
    const link = transferLink("BOVAKI", `${HUB}#chess?room=AB12`);
    expect(link).not.toContain("chess");
    expect(link).not.toContain("AB12");
  });

  it("в обычном адресе кода нет", () => {
    expect(codeInUrl(HUB)).toBeUndefined();
    expect(codeInUrl(`${HUB}?${RESTORE_PARAM}=`)).toBeUndefined();
  });
});

describe("home.the-transfer-link-never-stays-in-the-address", () => {
  type Restore = (code: string) => Promise<{ id: string; name: string; recoveryHash: string } | undefined>;
  const found: Restore = async () => ({ id: "acc-1", name: "Ербол", recoveryHash: "BOVAKI" });

  const parts = (href: string, restore = vi.fn(found)) => {
    let now = href;
    return {
      cleaned: () => now,
      restore,
      parts: { href: () => now, clean: (next: string) => (now = next), restore },
    };
  };

  it("код из адреса забирает себя и стирается", async () => {
    const one = parts(`${HUB}?${RESTORE_PARAM}=BOVAKI`);

    expect(await takeOverFromUrl(one.parts)).toBe(true);
    expect(one.restore).toHaveBeenCalledWith("BOVAKI");
    expect(codeInUrl(one.cleaned())).toBeUndefined();
  });

  it("неверный код стирается тоже — иначе он срабатывал бы на каждой перезагрузке", async () => {
    const one = parts(`${HUB}?${RESTORE_PARAM}=NOPE`, vi.fn<Restore>(async () => undefined));

    expect(await takeOverFromUrl(one.parts)).toBe(false);
    expect(codeInUrl(one.cleaned())).toBeUndefined();
  });

  it("сервер бросил — адрес всё равно чист", async () => {
    const one = parts(
      `${HUB}?${RESTORE_PARAM}=BOVAKI`,
      vi.fn<Restore>(async () => {
        throw new Error("offline");
      }),
    );

    await expect(takeOverFromUrl(one.parts)).rejects.toThrow();
    expect(codeInUrl(one.cleaned())).toBeUndefined();
  });

  it("обычный заход ничего не трогает", async () => {
    const one = parts(HUB);

    expect(await takeOverFromUrl(one.parts)).toBe(false);
    expect(one.restore).not.toHaveBeenCalled();
    expect(one.cleaned()).toBe(HUB);
  });

  it("чистый адрес — тот же самый, только без кода", () => {
    expect(withoutCode(`${HUB}?${RESTORE_PARAM}=BOVAKI#chess`)).toBe(`${HUB}#chess`);
  });
});
