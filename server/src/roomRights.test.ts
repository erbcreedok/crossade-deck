// СТОРОЖ `rooms.a-right-is-what-the-server-checks-not-what-the-screen-draws`.
//
// Панель за столом и сервер читают ОДНУ таблицу прав. Разойдись они — в списке кнопка есть, а
// сервер её не пускает (или наоборот, и тогда прав нет вовсе). Здесь караулятся те правила, из-за
// которых стол становится чужим: хозяина нельзя выгнать и разжаловать, себя нельзя выгнать, а
// уклад превращает разрешённое в предложение, не отменяя его.

import { describe, it, expect } from "vitest";
import { deedsOn, may, powerOf, type Someone } from "./roomRights.js";

const who = (account: string, role: Someone["role"], seated = true): Someone => ({ account, role, seated });

const owner = who("хозяин", "owner");
const admin = who("админ", "admin");
const player = who("игрок", "player");
// ЗРИТЕЛЬ — ЭТО ИГРОК БЕЗ СТУЛА, а не отдельный уровень: два вопроса, а не один.
const watcher = who("зритель", "player", false);

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

  it("стул ставит тот, кто распоряжается, — и только там, где мест не назначено правилом", () => {
    const cards = { chairs: 4, capacity: 32 };
    expect(may("seat:add", owner, watcher, "free", cards)).toBe(true);
    expect(may("seat:add", player, watcher, "free", cards)).toBe("мебель двигает тот, кто распоряжается");
    // За доской третьего места не бывает: это правило игры, а не настройка стола.
    expect(may("seat:add", owner, watcher, "free", { ...cards, chairsFixed: 2 })).toBe("за этой игрой мест ровно столько, сколько правил");
    // ...и стульев не может стать больше, чем комната держит людей.
    expect(may("seat:add", owner, watcher, "free", { chairs: 32, capacity: 32 })).toBe("больше людей эта комната не держит");
  });

  it("отказ всегда со словами — иначе пропавшая кнопка читается как поломка", () => {
    const { cant } = deedsOn(watcher, owner, "free");
    expect(cant.length).toBeGreaterThan(0);
    for (const one of cant) expect(one.why.length).toBeGreaterThan(3);
  });
});

// СТОРОЖ `rooms.a-level-and-a-chair-are-two-axes`.
//
// Уровень контроля и место за столом — разные вещи, и «зритель» не уровень, а игрок без места.
// Пока они были одним полем, «посадить» значило повысить, а «лишить места» — разжаловать; хозяин,
// вставший из-за стола, и вовсе не имел, чем называться.
describe("rooms.a-level-and-a-chair-are-two-axes", () => {
  it("без места игрок не решает, а хозяин и админ — решают", () => {
    expect(powerOf(who("и", "player", false), "free")).toBe("none");
    expect(powerOf(who("х", "owner", false), "free")).toBe("full");
    expect(powerOf(who("а", "admin", false), "free")).toBe("admin");
  });

  it("админа дают игроку, и место ему при этом не меняют", () => {
    expect(may("admin:grant", owner, who("и", "player", false), "free")).toBe(true);
    expect(may("admin:grant", owner, who("а", "admin", false), "free")).toBe("он уже с правами");
  });

  it("комнату передают тому, у кого есть место за столом", () => {
    expect(may("owner:pass", owner, who("и", "player", false), "free")).toBe("сначала посади его");
    expect(may("owner:pass", owner, who("и", "player", true), "free")).toBe(true);
  });

  it("руки нет у того, кому место не положено, — ни лока, ни скрытности", () => {
    expect(may("piece:lock", owner, who("и", "player", false), "free")).toBe("он не за столом — руки нет");
    expect(may("piece:hide", owner, who("и", "player", true), "free")).toBe(true);
  });
});
