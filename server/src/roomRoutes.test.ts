// СТОРОЖ `rooms.a-closed-table-is-not-replaced-by-a-new-one`.
//
// Прежде ссылка `#cards?room=0244` на закрывшийся стол молча открывала НОВЫЙ: человек думал, что
// пришёл к друзьям, а сидел один за пустым столом с тем же кодом. Здесь проверяется, что двери
// говорят правду — «стол закрылся», — и что вечная комната переживает пустоту вместе со своим кодом.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createApp } from "./app.js";

vi.mock("fs", () => ({
  existsSync: () => false,
  readFileSync: () => "[]",
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const PORT = 2691;
const BASE = `http://localhost:${PORT}`;

let httpServer: ReturnType<typeof createApp>["httpServer"];

beforeAll(async () => {
  roomsModule = await import("./rooms.js");
  ({ httpServer } = createApp());
  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

const post = (path: string, body?: unknown) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

async function account(): Promise<{ id: string; recoveryHash: string }> {
  return (await (await post("/accounts")).json()) as { id: string; recoveryHash: string };
}

/** Стол с названной встречей — заводится напрямую, без сессии: её поднимает сам сторож. */
function openRoomFor(owner: string, newcomer: "admin" | "player" | "spectator"): string {
  const { openRoom: make } = requireRooms();
  return make({ game: "cards", chairs: 2, ownerAccount: owner, newcomer })!.id;
}

let roomsModule: typeof import("./rooms.js") | undefined;
const requireRooms = () => roomsModule!;

async function open(body: Record<string, unknown> = {}) {
  const res = await post("/rooms", { game: "cards", ...body });
  return { res, body: (await res.json()) as Record<string, string> };
}

describe("rooms.a-closed-table-is-not-replaced-by-a-new-one", () => {
  it("открытый стол находится по своему коду", async () => {
    const { body } = await open();
    expect(body.code).toMatch(/^\d{4}$/);

    const found = (await (await fetch(`${BASE}/rooms/by-code/${body.code}`)).json()) as Record<string, string>;
    expect(found.room).toBe(body.room);
    expect(found.game).toBe("cards");
  });

  it("закрытый стол отвечает «закрылся», а не новым столом", async () => {
    const me = await account();
    const { body } = await open({ by: me.id });

    await fetch(`${BASE}/rooms/${body.room}?by=${me.id}`, { method: "DELETE" });

    const peek = await fetch(`${BASE}/rooms/by-code/${body.code}`);
    expect(peek.status).toBe(404);
    expect((await peek.json()).error).toBe("room_closed");

    const sit = await post("/rooms/join", { code: body.code });
    expect(sit.status).toBe(404);
  });

  it("вход по коду ведёт в ТУ ЖЕ комнату, а не в одноимённую новую", async () => {
    const { body } = await open();
    const first = (await (await post("/rooms/join", { code: body.code })).json()) as Record<string, string>;
    const second = (await (await post("/rooms/join", { code: body.code })).json()) as Record<string, string>;
    expect(first.room).toBe(body.room);
    expect(second.room).toBe(body.room);
    expect(second.roomId).toBe(first.roomId);
  });

  it("закрыть стол может только хозяин", async () => {
    const me = await account();
    const stranger = await account();
    const { body } = await open({ by: me.id });

    const denied = await fetch(`${BASE}/rooms/${body.room}?by=${stranger.id}`, { method: "DELETE" });
    expect(denied.status).toBe(403);
    expect((await fetch(`${BASE}/rooms/by-code/${body.code}`)).status).toBe(200);

    const allowed = await fetch(`${BASE}/rooms/${body.room}?by=${me.id}`, { method: "DELETE" });
    expect(allowed.status).toBe(200);
  });

  it("стол помнит свой уклад, свою вечность, свои стулья и свою вместимость", async () => {
    const { body } = await open({ mode: "council", forever: true, chairs: 6, capacity: 12 });
    const found = (await (await fetch(`${BASE}/rooms/by-code/${body.code}`)).json()) as Record<string, unknown>;
    expect(found.mode).toBe("council");
    expect(found.forever).toBe(true);
    expect(found.chairs).toBe(6);
    expect(found.capacity).toBe(12);
  });

  it("свой код берут, если он свободен, и буквы в нём можно", async () => {
    const { body } = await open({ code: "maft" });
    expect(body.code).toBe("MAFT");
    const second = await open({ code: "MAFT" });
    expect(second.body.code).not.toBe("MAFT");
    // ...а выданный остаётся цифрами: его диктуют вслух.
    expect(second.body.code).toMatch(/^\d{4}$/);
  });

  it("уклада, которого нет, не бывает", async () => {
    expect((await post("/rooms", { game: "cards", mode: "диктатура" })).status).toBe(400);
  });

  it("игра, которой нет, стола не заводит", async () => {
    expect((await post("/rooms", { game: "шашки" })).status).toBe(400);
    expect((await post("/rooms", { game: "cards", visibility: "секретная" })).status).toBe(400);
  });
});

describe("поиск столов", () => {
  it("публичный виден, скрытый — нет", async () => {
    const me = await account();
    const seen = await open({ by: me.id, visibility: "public", title: "заходите" });
    const hidden = await open({ by: me.id, visibility: "hidden" });

    const list = (await (await fetch(`${BASE}/rooms?game=cards`)).json()) as Record<string, string>[];
    const ids = list.map((one) => one.room);
    expect(ids).toContain(seen.body.room);
    expect(ids).not.toContain(hidden.body.room);

    // И БЕЗ ВОПРОСА ПРО ИГРУ — ТОТ ЖЕ ОТВЕТ. Список без игры проверяется отдельно: правда о
    // видимости не должна зависеть от того, спросили ли заодно про игру.
    const all = (await (await fetch(`${BASE}/rooms`)).json()) as Record<string, string>[];
    expect(all.map((one) => one.room)).toContain(seen.body.room);
    expect(all.map((one) => one.room)).not.toContain(hidden.body.room);
  });

  it("скрытая комната остаётся в списке своих", async () => {
    const me = await account();
    const hidden = await open({ by: me.id, visibility: "hidden" });

    const mine = (await (await fetch(`${BASE}/accounts/${me.id}/rooms`)).json()) as Record<string, unknown>[];
    expect(mine.map((one) => one.room)).toContain(hidden.body.room);
    expect(mine.find((one) => one.room === hidden.body.room)?.own).toBe(true);
  });

  it("в списке нет ключей: ни номера хозяина, ни номеров людей", async () => {
    const me = await account();
    await open({ by: me.id });
    const list = (await (await fetch(`${BASE}/rooms`)).json()) as Record<string, unknown>[];
    for (const one of list) {
      expect(one).not.toHaveProperty("ownerAccount");
      // Хозяин виден ИМЕНЕМ — «стол Марата» человек узнаёт, а номер аккаунта ему ничего не говорит
      // и является ключом.
      expect(one).toHaveProperty("owner");
      for (const person of (one.people ?? []) as Record<string, unknown>[]) {
        expect(person).not.toHaveProperty("accountId");
      }
    }
  });

  it("свои столы приходят в том же списке и помечены группой", async () => {
    const me = await account();
    const own = await open({ by: me.id, visibility: "hidden", forever: true });

    const list = (await (await fetch(`${BASE}/rooms?me=${me.id}`)).json()) as Record<string, unknown>[];
    const row = list.find((one) => one.room === own.body.room);
    expect(row?.group).toBe("forever");
    expect(row?.mySeat).toBe(true);

    // ...и чужому та же комната не видна вовсе.
    const stranger = await account();
    const theirs = (await (await fetch(`${BASE}/rooms?me=${stranger.id}`)).json()) as Record<string, unknown>[];
    expect(theirs.map((one) => one.room)).not.toContain(own.body.room);
  });
});

// СТОРОЖ `rooms.an-empty-table-waits-before-it-closes`.
//
// Вечность — выбор хозяина, а не свойство машинерии: невечный стол, оставшийся стоять навсегда,
// зарастает мусором, и список перестают читать. Но закрывать его В ТУ ЖЕ СЕКУНДУ, когда кончилась
// сессия, нельзя — так умирают две обычные вещи: стол, за который ещё не успели сесть (его открыли,
// чтобы прислать другу код), и ПЕРЕЗАГРУЗКА СТРАНИЦЫ, которая для сервера такой же уход последнего.
describe("rooms.an-empty-table-waits-before-it-closes", () => {
  it("стол, за который ещё не сели, не умирает в ту же секунду", async () => {
    const { sessionEnded } = await import("./rooms.js");
    const once = await open({ forever: false });

    sessionEnded(once.body.room!);

    expect((await fetch(`${BASE}/rooms/by-code/${once.body.code}`)).status).toBe(200);
  });

  it("простояв пустым, невечный закрывается сам и отдаёт код; вечный стоит", async () => {
    const { sessionEnded, closeLater, forgetClosings } = await import("./rooms.js");
    forgetClosings();
    const once = await open({ forever: false });
    const always = await open({ forever: true });

    sessionEnded(once.body.room!);
    sessionEnded(always.body.room!);
    // Тот же будильник, только на десять миллисекунд вместо получаса.
    forgetClosings();
    closeLater(once.body.room!, 10);
    closeLater(always.body.room!, 10);
    await new Promise((r) => setTimeout(r, 30));

    expect((await fetch(`${BASE}/rooms/by-code/${once.body.code}`)).status).toBe(404);
    expect((await fetch(`${BASE}/rooms/by-code/${always.body.code}`)).status).toBe(200);
  });

  it("вернулись за стол — закрывать нечего", async () => {
    const { closeLater, forgetClosings } = await import("./rooms.js");
    forgetClosings();
    const once = await open({ forever: false });

    closeLater(once.body.room!, 10);
    // Вернулись: сессия снова идёт, и будильник, проснувшись, ничего не делает.
    await post("/rooms/join", { code: once.body.code });
    await new Promise((r) => setTimeout(r, 30));

    expect((await fetch(`${BASE}/rooms/by-code/${once.body.code}`)).status).toBe(200);
  });
});

// СТОРОЖ `rooms.the-code-is-in-your-hand-before-the-table-exists`.
//
// Комнату зовут кодом, и по стенду его показывают ДО нажатия «Создать»: его отправляют другу, ещё
// не сев за стол. Значит между «дай код» и «открой комнату» проходят минуты — и всё это время код
// должен быть занят, иначе друг придёт не за тот стол.
describe("rooms.the-code-is-in-your-hand-before-the-table-exists", () => {
  it("код выдают до комнаты, и второму его уже не дадут", async () => {
    const { code } = (await (await post("/rooms/code")).json()) as { code: string };
    expect(code).toMatch(/^\d{4}$/);

    const free = (await (await fetch(`${BASE}/rooms/code/${code}`)).json()) as { free: boolean };
    expect(free.free).toBe(false);

    // ...и случайная выдача его тоже обходит.
    for (let n = 0; n < 20; n++) {
      const next = (await (await post("/rooms/code")).json()) as { code: string };
      expect(next.code).not.toBe(code);
    }
  });

  it("выданным кодом открывается именно та комната, которую обещали", async () => {
    const { code } = (await (await post("/rooms/code")).json()) as { code: string };
    const made = await open({ code });
    expect(made.body.code).toBe(code);
  });

  it("свободный код так и называется свободным", async () => {
    const free = (await (await fetch(`${BASE}/rooms/code/MAFT2`)).json()) as { free: boolean };
    expect(free.free).toBe(true);
    const bad = (await (await fetch(`${BASE}/rooms/code/%D1%81%D1%82%D0%BE%D0%BB`)).json()) as { free: boolean };
    expect(bad.free).toBe(false);
  });
});

// СТОРОЖ `rooms.the-turn-is-told-only-to-whose-turn-it-is`.
//
// Метка «твой ход» — единственное, ради чего список комнат открывают заново. Но чужая очередь не
// дело постороннего: посторонний видит, что за столом идёт игра, и не видит, кого именно ждут.
describe("rooms.the-turn-is-told-only-to-whose-turn-it-is", () => {
  it("ждут одного — метку видит он один", async () => {
    const { setTurn } = await import("./roomPeople.js");
    const me = await account();
    const you = await account();
    const { body } = await open({ by: me.id });

    setTurn(body.room!, me.id);

    const mineRow = ((await (await fetch(`${BASE}/rooms?me=${me.id}`)).json()) as Record<string, unknown>[])
      .find((one) => one.room === body.room);
    expect(mineRow?.myTurn).toBe(true);

    const theirs = ((await (await fetch(`${BASE}/rooms?me=${you.id}`)).json()) as Record<string, unknown>[])
      .find((one) => one.room === body.room);
    expect(theirs?.myTurn).toBeUndefined();
  });
});

// СТОРОЖ `rooms.an-invited-table-is-raised-by-the-first-to-arrive`.
//
// Приглашение уходит в чужую переписку раньше стола: бот отвечает на `@CrossaderBot chess`
// карточкой с кодом, а комнату заводит тот, кто первым по ней придёт. Два вранья, которые здесь
// караулятся: комната, заведённая на каждый набранный запрос (пустые столы на каждую букву), и
// «стол закрылся» на приглашении, за которое ещё никто не садился.
describe("rooms.an-invited-table-is-raised-by-the-first-to-arrive", () => {
  it("обещанный код рассказывает про стол, но комнаты ещё не заводит", async () => {
    const { code } = (await (await post("/rooms/code", { game: "chess", forever: true })).json()) as { code: string };
    const seen = (await (await fetch(`${BASE}/rooms/by-code/${code}`)).json()) as Record<string, unknown>;
    expect(seen.game).toBe("chess");
    expect(seen.forever).toBe(true);
    expect(seen.waiting).toBe(true);
    // Комнаты нет: стола с таким кодом ни в одном списке ещё не стоит.
    expect(seen.room).toBeNull();
  });

  it("первый вошедший заводит стол, второй садится за тот же", async () => {
    const { code } = (await (await post("/rooms/code", { game: "chess", forever: true })).json()) as { code: string };
    const first = (await (await post("/rooms/join", { code })).json()) as Record<string, string>;
    expect(first.game).toBe("chess");
    expect(first.code).toBe(code);
    const second = (await (await post("/rooms/join", { code })).json()) as Record<string, string>;
    expect(second.room).toBe(first.room);
  });

  it("код без обещания по-прежнему значит «стол закрылся»", async () => {
    const { code } = (await (await post("/rooms/code")).json()) as { code: string };
    expect((await fetch(`${BASE}/rooms/by-code/${code}`)).status).toBe(404);
    expect((await post("/rooms/join", { code })).status).toBe(404);
  });
});

// СТОРОЖ `rooms.the-roster-is-one-list-and-a-chair-is-a-seat`.
//
// Полоса сверху показывает сидящих, список за ней — комнату, и это ОДИН стол: разойдясь, они
// говорят про него разное, и человек видит на сукне того, кого нет в списке. Второе враньё,
// которое здесь караулится, — «за столом» по роли: хозяин, которого сегодня не было, стула не
// занимает, и писать ему «за столом · отошёл» значит рисовать место, которого нет.
describe("rooms.the-roster-is-one-list-and-a-chair-is-a-seat", () => {
  it("числятся все, а стул — только у того, кто сидит в идущей сессии", async () => {
    const { addMember } = await import("./db/roomsRepo.js");
    const { setPeople } = await import("./roomPeople.js");
    const me = await account();
    const mate = await account();
    const watcher = await account();
    const { body } = await open({ by: me.id, forever: true });

    addMember(body.room!, mate.id, "player");
    addMember(body.room!, watcher.id, "spectator");
    // За столом сидит один: место в сессии есть только у него.
    setPeople(body.room!, [{ name: "он", color: null, seat: "p1", accountId: mate.id }]);

    const roster = (await (await fetch(`${BASE}/rooms/${body.room}/roster`)).json()) as Record<string, unknown>[];
    expect(roster.map((one) => one.role)).toEqual(["owner", "player", "spectator"]);
    const at = (id: string) => roster.find((one) => one.account === id)!;
    expect(at(mate.id).seat).toBe("p1");
    // Хозяин числится, но не сидит — и это «нет стула», а не «отошёл».
    expect(at(me.id).seat).toBeNull();
    expect(at(me.id).away).toBeUndefined();
    expect(at(watcher.id).seat).toBeNull();
  });

  it("сел гость, которого база не знает, — он всё равно в списке", async () => {
    const { setPeople } = await import("./roomPeople.js");
    const me = await account();
    const { body } = await open({ by: me.id });
    setPeople(body.room!, [{ name: "Кривой чебурек", color: null, seat: "p2" }]);

    const roster = (await (await fetch(`${BASE}/rooms/${body.room}/roster`)).json()) as Record<string, unknown>[];
    const guest = roster.find((one) => one.name === "Кривой чебурек")!;
    expect(guest.seat).toBe("p2");
    expect(guest.account).toBeUndefined();
  });

  it("стол, которого нет, отвечает «закрылся», а не пустым списком", async () => {
    expect((await fetch(`${BASE}/rooms/room_ниоткуда/roster`)).status).toBe(404);
  });
});

// СТОРОЖ `rooms.a-mock-user-takes-a-chair-and-a-live-absent-one-does-not`.
//
// Мок-юзер заведён затем, чтобы за столом было кого показать: он садится сам, как только стол
// поднялся, и по роли — админ и игрок со стульями, зритель без. Живого члена комнаты, которого
// сейчас нет, сажать нельзя ни в коем случае: это место, за которым его не было.
describe("rooms.a-mock-user-takes-a-chair-and-a-live-absent-one-does-not", () => {
  it("мок садится по роли, живой отсутствующий остаётся без стула", async () => {
    const { addMember } = await import("./db/roomsRepo.js");
    const { insertAccount } = await import("./db/accountsRepo.js");
    const { sessionOf } = await import("./rooms.js");
    const { peopleAt } = await import("./roomPeople.js");

    const me = await account();
    const absent = await account();
    // Стол заводится БЕЗ сессии: моки садятся, когда её поднимают, и до этого их сажать некуда.
    const { byId: find, openRoom: makeRoom } = await import("./rooms.js");
    const room = makeRoom({ game: "cards", chairs: 4, ownerAccount: me.id, forever: true })!;
    const body = { room: room.id } as Record<string, string>;

    const mock = (name: string, role: "admin" | "player" | "spectator") => {
      const id = `mock_${name}_${Date.now()}`;
      insertAccount({
        id,
        name,
        nameChosen: true,
        color: null,
        avatar: null,
        createdAt: Date.now(),
        recoveryHash: id,
        bot: true,
      });
      addMember(body.room!, id, role);
      return id;
    };
    const boss = mock("мок-админ", "admin");
    const mate = mock("мок-игрок", "player");
    const watcher = mock("мок-зритель", "spectator");
    addMember(body.room!, absent.id, "player");

    await sessionOf(find(body.room!)!);

    const seats = new Map(peopleAt(body.room!).map((one) => [one.name, one.seat]));
    expect(seats.get("мок-админ")).toMatch(/^p\d+$/);
    expect(seats.get("мок-игрок")).toMatch(/^p\d+$/);
    expect(seats.get("мок-админ")).not.toBe(seats.get("мок-игрок"));
    expect(seats.get("мок-зритель")).toBeNull();
    const roster = (await (await fetch(`${BASE}/rooms/${body.room}/roster`)).json()) as Record<string, unknown>[];
    expect(roster.find((one) => one.account === absent.id)!.seat).toBeNull();
    expect(roster.find((one) => one.account === boss)!.seat).not.toBeNull();
    expect(roster.find((one) => one.account === mate)!.seat).not.toBeNull();
    expect(roster.find((one) => one.account === watcher)!.seat).toBeNull();
  });
});

// СТОРОЖ `rooms.the-room-says-who-a-newcomer-arrives-as`.
//
// Стол на двоих и стол на тридцать человек живут по-разному: за первым пришедший садится играть, за
// вторым — смотрит, пока ему не дадут стул. Зашитое правило «новый — игрок» обслуживало только
// первый случай. Настройка ставится при создании и переставляется потом — и только теми, кто
// распоряжается столом; вошедшего раньше она не разжалует.
describe("rooms.the-room-says-who-a-newcomer-arrives-as", () => {
  it("комната родится с названной встречей и меняет её по просьбе хозяина", async () => {
    const me = await account();
    const { body } = await open({ by: me.id, newcomer: "spectator" });
    const born = (await (await fetch(`${BASE}/rooms/by-code/${body.code}`)).json()) as Record<string, unknown>;
    expect(born.newcomer).toBe("spectator");

    const after = await fetch(`${BASE}/rooms/${body.room}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ by: me.id, newcomer: "admin", chairs: 6 }),
    });
    expect(after.status).toBe(200);
    const now = (await after.json()) as Record<string, unknown>;
    expect(now.newcomer).toBe("admin");
    expect(now.chairs).toBe(6);
  });

  it("посторонний стол не перенастраивает, и выдуманное слово не принимается", async () => {
    const me = await account();
    const stranger = await account();
    const { body } = await open({ by: me.id });

    const theirs = await fetch(`${BASE}/rooms/${body.room}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ by: stranger.id, newcomer: "admin" }),
    });
    expect(theirs.status).toBe(403);

    const nonsense = await fetch(`${BASE}/rooms/${body.room}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ by: me.id, newcomer: "оунер" }),
    });
    expect(nonsense.status).toBe(400);
    // Хозяином родиться нельзя: он у стола уже есть.
    const asOwner = await fetch(`${BASE}/rooms/${body.room}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ by: me.id, newcomer: "owner" }),
    });
    expect(asOwner.status).toBe(400);
  });

  it("вернувшийся игрок садится, если за столом есть куда", async () => {
    const { byId: find, sessionOf } = await import("./rooms.js");
    const { setRole } = await import("./db/roomsRepo.js");
    const { peopleAt } = await import("./roomPeople.js");
    const { Client } = await import("colyseus.js");

    const me = await account();
    const mate = await account();
    // Стол встречает зрителями: вошедший стула не получит...
    const room = openRoomFor(me.id, "spectator");
    const session = await sessionOf(find(room)!);
    const client = new Client(`ws://localhost:${PORT}`);
    const holding = await client.joinById(session, { accountId: me.id, name: "Хозяин" });
    const guest = await client.joinById(session, { accountId: mate.id, name: "Гость" });
    await new Promise((r) => setTimeout(r, 150));
    expect(peopleAt(room).find((p) => p.accountId === mate.id)?.seat).toBeNull();

    // ...а потом ему дали роль игрока: на возврате стул должен найтись сам.
    setRole(room, mate.id, "player");
    await guest.leave(false);
    await new Promise((r) => setTimeout(r, 150));
    const again = await client.joinById(session, { accountId: mate.id, name: "Гость" });
    await new Promise((r) => setTimeout(r, 150));
    expect(peopleAt(room).find((p) => p.accountId === mate.id)?.seat).toMatch(/^p\d+$/);

    await again.leave();
    await holding.leave();
  });

  it("зритель входит без стула, игрок — со стулом, и роль пишется в членство", async () => {
    const { byId: find, sessionOf } = await import("./rooms.js");
    const { roleOf } = await import("./db/roomsRepo.js");
    const { peopleAt } = await import("./roomPeople.js");
    const { Client } = await import("colyseus.js");

    const me = await account();
    const guest = await account();
    const watcher = await account();
    const seated = openRoomFor(me.id, "player");
    const watched = openRoomFor(me.id, "spectator");
    await sessionOf(find(seated)!);
    await sessionOf(find(watched)!);

    const client = new Client(`ws://localhost:${PORT}`);
    const one = await client.joinById(find(seated)!.sessionId!, { accountId: guest.id, name: "Гость" });
    const two = await client.joinById(find(watched)!.sessionId!, { accountId: watcher.id, name: "Зритель" });
    await new Promise((r) => setTimeout(r, 120));

    expect(peopleAt(seated).find((p) => p.accountId === guest.id)?.seat).toBe("p1");
    expect(roleOf(seated, guest.id)).toBe("player");
    expect(peopleAt(watched).find((p) => p.accountId === watcher.id)?.seat).toBeNull();
    expect(roleOf(watched, watcher.id)).toBe("spectator");

    one.leave();
    two.leave();
  });
});
