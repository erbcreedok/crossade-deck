// АККАУНТ И ЕГО ДВЕРИ. Сторож `accounts.two-full-accounts-never-merge` — правило необратимое,
// поэтому оно жёсткое: слиянием можно потерять предметы, и первая же жалоба будет неразрешима.

import { describe, it, expect, vi } from "vitest";

vi.mock("fs", () => ({
  existsSync: () => false,
  readFileSync: () => "[]",
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import {
  createAccount,
  findAccountByTelegramId,
  isGuest,
  linkTelegram,
  declineTelegramOffer,
  profileOf,
  telegramDoor,
  unlinkTelegram,
  updateProfile,
} from "./accounts.js";
import { linkIdentity } from "./db/accountsRepo.js";

describe("гость — это ноль дверей", () => {
  it("заведённый молча аккаунт гостевой", () => {
    const guest = createAccount();
    expect(isGuest(guest.id)).toBe(true);
    expect(profileOf(guest.id)?.identities).toEqual([]);
  });

  it("вошедший через телегу — уже не гость, и телеграм виден как поле по-прежнему", () => {
    const account = createAccount("Ербол", "tg-1");
    expect(isGuest(account.id)).toBe(false);
    expect(account.telegramId).toBe("tg-1");
    expect(findAccountByTelegramId("tg-1")?.id).toBe(account.id);
  });
});

describe("привязка телеграма", () => {
  it("свободная дверь привязывается к своему аккаунту", () => {
    const guest = createAccount();
    const result = linkTelegram(guest.id, guest.recoveryHash, "tg-free");
    expect(result?.kind).toBe("linked");
    expect(findAccountByTelegramId("tg-free")?.id).toBe(guest.id);
    expect(isGuest(guest.id)).toBe(false);
  });

  it("повторная привязка той же двери ничего не ломает", () => {
    const account = createAccount("Дана", "tg-same");
    const result = linkTelegram(account.id, account.recoveryHash, "tg-same");
    expect(result?.kind).toBe("linked");
    expect(profileOf(account.id)?.identities.map((one) => one.provider)).toEqual(["telegram"]);
  });

  it("чужим кодом не привязать", () => {
    const account = createAccount();
    expect(linkTelegram(account.id, "WRONGC", "tg-x")).toBeUndefined();
    expect(findAccountByTelegramId("tg-x")).toBeUndefined();
  });

  it("одна дверь не ведёт к двоим", () => {
    const first = createAccount("Первый", "tg-one");
    const second = createAccount("Второй");
    expect(() => linkIdentity(second.id, "telegram", "tg-one")).toThrow();
    expect(findAccountByTelegramId("tg-one")?.id).toBe(first.id);
  });
});

describe("accounts.two-full-accounts-never-merge", () => {
  it("чистый гость не сливается, а переключается на свой настоящий аккаунт", () => {
    const real = createAccount("Ербол", "tg-real");
    const guest = createAccount();

    const result = linkTelegram(guest.id, guest.recoveryHash, "tg-real");

    expect(result?.kind).toBe("switch");
    expect(result?.account.id).toBe(real.id);
    // Гостевой аккаунт остаётся там, где был: ничего не уничтожено и ничего не перенесено.
    expect(isGuest(guest.id)).toBe(true);
    expect(profileOf(guest.id)).toBeDefined();
  });

  it("две полноценные стороны — отказ, и в базе не меняется ничего", () => {
    const mine = createAccount("Мой", "tg-mine");
    const other = createAccount("Чужой", "tg-other");

    const result = linkTelegram(mine.id, mine.recoveryHash, "tg-other");

    expect(result?.kind).toBe("conflict");
    expect(result?.account.id).toBe(other.id);
    expect(profileOf(mine.id)?.identities.map((one) => one.provider)).toEqual(["telegram"]);
    expect(findAccountByTelegramId("tg-other")?.id).toBe(other.id);
    expect(findAccountByTelegramId("tg-mine")?.id).toBe(mine.id);
  });
});

describe("профиль", () => {
  it("цвет и аватар меняются своим кодом и снимаются пустым значением", () => {
    const account = createAccount("Тимур");
    const painted = updateProfile(account.id, account.recoveryHash, { color: "#f2c14e", avatar: "🐙" });
    expect(painted?.color).toBe("#f2c14e");
    expect(painted?.avatar).toBe("🐙");

    const bare = updateProfile(account.id, account.recoveryHash, { color: "", avatar: "" });
    expect(bare?.color).toBeUndefined();
    expect(profileOf(account.id)?.color).toBeNull();
  });

  it("чужим кодом не перекрасить", () => {
    const account = createAccount("Алия");
    expect(updateProfile(account.id, "WRONGC", { color: "#000000" })).toBeUndefined();
    expect(profileOf(account.id)?.color).toBeNull();
  });

  it("наружу отдаются двери, но не ключи от них", () => {
    const account = createAccount("Канат", "tg-secret");
    const profile = profileOf(account.id)!;
    expect(profile.identities.map((one: { provider: string }) => one.provider)).toEqual(["telegram"]);
    expect(JSON.stringify(profile)).not.toContain("tg-secret");
  });

  it("пустое имя игнорируется — человек без имени за столом это дыра", () => {
    const account = createAccount("Асель");
    updateProfile(account.id, account.recoveryHash, { name: "   " });
    expect(profileOf(account.id)?.name).toBe("Асель");
  });
});

// ПОДПИСЬ ДВЕРИ И ОТВЯЗКА.
//
// «Telegram: привязан» приходится принимать на веру; «Telegram: @erbol» человек УЗНАЁТ — и видит,
// тот ли это его аккаунт. Ключ (subject) при этом наружу по-прежнему не отдаётся.
describe("дверь подписана, и её можно закрыть", () => {
  it("подпись едет в профиль, ключ — нет", () => {
    const account = createAccount("Ербол", "70001", { label: "@erbol" });

    const door = profileOf(account.id)!.identities[0]!;
    expect(door).toEqual({ provider: "telegram", label: "@erbol" });
    expect(JSON.stringify(profileOf(account.id))).not.toContain("70001");
  });

  it("без подписи дверь всё равно дверь", () => {
    const account = createAccount("Дана", "70002");
    expect(profileOf(account.id)!.identities[0]).toEqual({ provider: "telegram", label: null });
  });

  it("отвязал — снова гость, но тот же самый человек", () => {
    const account = createAccount("Марат", "70003", { label: "@marat" });

    const after = unlinkTelegram(account.id, account.recoveryHash);

    expect(after?.id).toBe(account.id);
    expect(after?.telegramId).toBeUndefined();
    expect(isGuest(account.id)).toBe(true);
    // Имя, цвет и код восстановления остаются: потеря телеги не уносит человека.
    expect(profileOf(account.id)?.name).toBe("Марат");
    expect(findAccountByTelegramId("70003")).toBeUndefined();
  });

  it("чужим кодом не отвязать", () => {
    const account = createAccount("Алия", "70004", { label: "@aliya" });
    expect(unlinkTelegram(account.id, "WRONGC")).toBeUndefined();
    expect(isGuest(account.id)).toBe(false);
  });

  it("отвязанную дверь можно привязать снова — хоть к другому аккаунту", () => {
    const first = createAccount("Первый", "70005", { label: "@one" });
    unlinkTelegram(first.id, first.recoveryHash);

    const second = createAccount("Второй");
    expect(linkTelegram(second.id, second.recoveryHash, "70005")?.kind).toBe("linked");
    expect(findAccountByTelegramId("70005")?.id).toBe(second.id);
  });
});

// ВОШЁЛ С НУЛЯ — ИМЯ И ЛИЦО ПРОСТО СТАНОВЯТСЯ ЕГО, без вопросов. Спрашивать «взять ли твоё имя» у
// того, у кого своего ещё нет, незачем: отказ оставил бы его с кличкой, которую он и пришёл менять.
describe("приёмка имени и лица из телеги", () => {
  it("у кого ничего своего — берётся молча", () => {
    const guest = createAccount();

    const result = linkTelegram(guest.id, guest.recoveryHash, "80001", {
      label: "@erbol",
      name: "Ербол Сыздык",
      photo: "https://t.me/i/erbol.jpg",
    });

    expect(result?.kind).toBe("linked");
    expect(result?.account.name).toBe("Ербол Сыздык");
    expect(result?.account.avatar).toBe("https://t.me/i/erbol.jpg");
    // ...и это больше не кличка: предлагать ему «назваться» теперь незачем.
    expect(profileOf(guest.id)?.nameChosen).toBe(true);
  });

  it("у кого своё имя — молча не забирают, спросят отдельно", () => {
    const named = createAccount("Ерболчик");

    linkTelegram(named.id, named.recoveryHash, "80002", { name: "Ербол Сыздык", photo: "https://t.me/i/e.jpg" });

    expect(profileOf(named.id)?.name).toBe("Ерболчик");
    expect(profileOf(named.id)?.avatar).toBeNull();
  });

  it("длинное тамошнее имя обрезается по той же мерке, что и своё", () => {
    const guest = createAccount();
    linkTelegram(guest.id, guest.recoveryHash, "80003", { name: "Я".repeat(40) });
    expect(profileOf(guest.id)!.name.length).toBe(24);
  });
});

// СТОРОЖ `accounts.a-returning-door-re-asks-what-is-behind-it`.
//
// Дверь, записанная однажды, показывала бы позавчерашнее до скончания века: человек сменил в телеге
// лицо, приходит снова — и предложения нет, потому что в первый раз лица не было.
describe("accounts.a-returning-door-re-asks-what-is-behind-it", () => {
  it("вторая привязка обновляет то, что дверь может предложить", () => {
    const account = createAccount("Своё имя");
    linkTelegram(account.id, account.recoveryHash, "81001", { name: "Ербол" });
    expect(profileOf(account.id)!.identities[0]!.label).toBeNull();

    linkTelegram(account.id, account.recoveryHash, "81001", {
      label: "@erbol",
      name: "Ербол Сыздык",
      photo: "data:image/jpeg;base64,AAAA",
    });

    const door = profileOf(account.id)!.identities[0]!;
    expect(door.label).toBe("@erbol");
    expect(telegramDoor(account.id)?.offeredPhoto).toBe("data:image/jpeg;base64,AAAA");
    expect(telegramDoor(account.id)?.offeredName).toBe("Ербол Сыздык");
  });

  it("сменилось лицо — прежний отказ снимается: он был про другое лицо", () => {
    const account = createAccount("Своё имя");
    linkTelegram(account.id, account.recoveryHash, "81002", { photo: "старое" });
    declineTelegramOffer(account.id, account.recoveryHash, "photo");
    expect(telegramDoor(account.id)?.declinedPhoto).toBe(true);

    linkTelegram(account.id, account.recoveryHash, "81002", { photo: "новое" });

    expect(telegramDoor(account.id)?.declinedPhoto).toBe(false);
  });

  it("лицо то же — отказ остаётся отказом", () => {
    const account = createAccount("Своё имя");
    linkTelegram(account.id, account.recoveryHash, "81003", { photo: "то же" });
    declineTelegramOffer(account.id, account.recoveryHash, "photo");

    linkTelegram(account.id, account.recoveryHash, "81003", { photo: "то же" });

    expect(telegramDoor(account.id)?.declinedPhoto).toBe(true);
  });
});
