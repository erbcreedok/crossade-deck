import { describe, expect, it } from "vitest";
import { applyRoomCommand, canTouch, createRoom, guestName, memberAt, occupantsFor, type RoomState } from "./room";

// Комната: три ортогональных факта (identity/membership/occupancy), гости «цвет+зверь»,
// политика «мешать», смена борды с сохранением людей.

function room(...cmds: Parameters<typeof applyRoomCommand>[1][]): RoomState {
  let r = createRoom("5246", "chess");
  for (const c of cmds) r = applyRoomCommand(r, c);
  return r;
}

describe("вход и роли", () => {
  it("первый вошедший — модератор; гость получает имя «цвет + зверь» и цвет из имени", () => {
    const r = room({ t: "join", id: "u1", displayName: "Ербол" }, { t: "join", id: "g1", guest: true });
    expect(r.members[0]!.membership).toBe("moderator");
    expect(r.members[1]!.membership).toBe("member");
    const g = r.members[1]!;
    expect(g.guest).toBe(true);
    expect(g.name.split(" ").length).toBe(2);
    expect(g.color).toBeGreaterThan(0);
  });

  it("имя гостя детерминировано по id; политика guestsAllowed=false не пускает гостей", () => {
    expect(guestName("abc")).toEqual(guestName("abc"));
    let r = createRoom("1", "chess", { guestsAllowed: false });
    r = applyRoomCommand(r, { t: "join", id: "g1", guest: true });
    expect(r.members).toEqual([]);
  });
});

describe("места: сесть, встать, поменяться", () => {
  const seated = room(
    { t: "join", id: "a", displayName: "A" },
    { t: "join", id: "b", displayName: "B" },
    { t: "sit", id: "a", seat: "p1" },
    { t: "sit", id: "b", seat: "p2" },
  );

  it("игрок — это человек на стуле; занятый стул не отдаётся", () => {
    expect(memberAt(seated, "p1")!.id).toBe("a");
    const denied = applyRoomCommand(seated, { t: "sit", id: "b", seat: "p1" });
    expect(memberAt(denied, "p1")!.id).toBe("a");
    expect(memberAt(denied, "p2")!.id).toBe("b"); // b остался где был
  });

  it("swapSeats меняет двух ИГРОКОВ стульями; встал — снова наблюдатель", () => {
    const swapped = applyRoomCommand(seated, { t: "swapSeats", a: "a", b: "b" });
    expect(memberAt(swapped, "p1")!.id).toBe("b");
    expect(memberAt(swapped, "p2")!.id).toBe("a");
    const stood = applyRoomCommand(seated, { t: "stand", id: "a" });
    expect(stood.members.find((m) => m.id === "a")!.occupancy).toEqual({ kind: "observer" });
    expect(occupantsFor(stood, ["p1", "p2"])).toEqual([null, "B"]);
  });
});

describe("политика «мешать» и смена борды", () => {
  it("наблюдатель трогает стол только при observersCanTouch", () => {
    let r = room({ t: "join", id: "a", displayName: "A" }, { t: "join", id: "z", displayName: "Z" }, { t: "sit", id: "a", seat: "p1" });
    expect(canTouch(r, "a")).toBe(true);
    expect(canTouch(r, "z")).toBe(false);
    r = applyRoomCommand(r, { t: "setPolicy", policy: { observersCanTouch: true } });
    expect(canTouch(r, "z")).toBe(true);
  });

  it("смена борды сохраняет людей/роли/цвета, но всех ссаживает (места новой борды — свои)", () => {
    let r = room({ t: "join", id: "a", displayName: "A" }, { t: "sit", id: "a", seat: "p1" });
    const color = r.members[0]!.color;
    r = applyRoomCommand(r, { t: "setBoard", boardId: "krestovyi" });
    expect(r.boardId).toBe("krestovyi");
    expect(r.members[0]!.membership).toBe("moderator");
    expect(r.members[0]!.color).toBe(color);
    expect(r.members[0]!.occupancy).toEqual({ kind: "observer" });
  });
});
