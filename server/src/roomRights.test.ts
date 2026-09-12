// СТОРОЖ `rooms.a-right-is-what-the-server-checks-not-what-the-screen-draws`.
//
// Панель за столом и сервер читают ОДНУ таблицу прав. Разойдись они — в списке кнопка есть, а
// сервер её не пускает (или наоборот, и тогда прав нет вовсе). Здесь караулятся те правила, из-за
// которых стол становится чужим: хозяина нельзя выгнать и разжаловать, себя нельзя выгнать, а
// уклад превращает разрешённое в предложение, не отменяя его.

import { describe, it, expect } from "vitest";
import { deedsOn, may, powerOf, type Someone } from "./roomRights.js";

const who = (account: string, role: Someone["role"], seated = role !== "spectator"): Someone => ({ account, role, seated });

const owner = who("хозяин", "owner");
const admin = who("админ", "admin");
const player = who("игрок", "player");
const watcher = who("зритель", "spectator");

describe("rooms.a-right-is-what-the-server-checks-not-what-the-screen-draws", () => {
  it("хозяина не выгнать и не разжаловать — даже другому админу", () => {
    expect(may("kick", admin, owner, "free")).toBe("хозяина нельзя выгнать");
    expect(may("admin:revoke", admin, owner, "free")).toBe("хозяина нельзя разжаловать");
  });

  it("себя не выгоняют кнопкой кика, а со своего стула встают сами", () => {
    expect(may("kick", admin, admin, "free")).toBe("себя выгоняют кнопкой «выйти»");
    expect(may("seat:take", admin, admin, "free")).toBe("со своего встают сами");
  });

  it("людьми распоряжается админ, а игрок и зритель — нет", () => {
    expect(may("seat:give", admin, watcher, "free")).toBe(true);
    expect(may("seat:give", player, watcher, "free")).toBe("мест не раздаёшь");
    expect(may("kick", watcher, player, "free")).toBe("выгонять некому");
  });

  it("свой цвет меняет каждый, чужой — тот, кто распоряжается", () => {
    expect(may("colour", watcher, watcher, "free")).toBe(true);
    expect(may("colour", player, admin, "free")).toBe("чужой цвет меняет тот, кто распоряжается");
    expect(may("colour", owner, player, "free")).toBe(true);
  });

  it("комнату передаёт только хозяин и только тому, у кого есть стул", () => {
    expect(may("owner:pass", admin, player, "free")).toBe("комнату передаёт только хозяин");
    expect(may("owner:pass", owner, watcher, "free")).toBe("сначала посади его");
    expect(may("owner:pass", owner, player, "free")).toBe(true);
  });

  it("уклад меняет не право, а его последствие: в совете то же становится предложением", () => {
    expect(powerOf(owner, "free")).toBe("full");
    expect(powerOf(admin, "free")).toBe("admin");
    expect(powerOf(owner, "council")).toBe("proposal");
    expect(powerOf(player, "assembly")).toBe("proposal");
    expect(powerOf(watcher, "assembly")).toBe("none");

    const council = deedsOn(admin, player, "council").can.find((one) => one.deed === "kick")!;
    expect(council.vote).toBe(true);
    expect(council.label).toBe("Предложить: выгнать");
    // ...а своё над собой голосования не требует: цвет — не про комнату.
    const mine = deedsOn(admin, admin, "council").can.find((one) => one.deed === "colour")!;
    expect(mine.vote).toBe(false);
  });

  it("отказ всегда со словами — иначе пропавшая кнопка читается как поломка", () => {
    const { cant } = deedsOn(watcher, owner, "free");
    expect(cant.length).toBeGreaterThan(0);
    for (const one of cant) expect(one.why.length).toBeGreaterThan(3);
  });
});
