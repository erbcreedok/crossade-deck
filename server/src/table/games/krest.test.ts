// ПРАВИЛА КРЕСТОВОГО — таблицей случаев. Игру нельзя проверить глазами: «бьёт или нет» это не вид,
// а ответ, и ошибка в нём замечается за столом через полчаса игры, когда уже не докажешь.

import { describe, expect, it } from "vitest";
import type { Face } from "../contract.js";
import { beats, bottom, closed, firstMover, krestDesk, lay, leaving, loser, nextOpener, openCircle, RING, takeBottom, top } from "./krest.js";
import type { DeskAsk } from "../rules.js";
import { allowed } from "../access.js";

const c = (rank: string, suit: Face["suit"]): Face => ({ rank, suit });
/** Джокеры: красный и чёрный. */
const RED = c("JK", "r");
const BLACK = c("JK", "b");

describe("старшинство: обычный дурак плюс три своих закона", () => {
  it("старшая той же масти бьёт младшую", () => {
    expect(beats(c("K", "s"), c("9", "s"))).toBe(true);
    expect(beats(c("9", "s"), c("K", "s"))).toBe(false);
  });

  it("буби — козырь: бьёт любую чужую масть, кроме крестей", () => {
    expect(beats(c("6", "d"), c("A", "s"))).toBe(true);
    expect(beats(c("6", "d"), c("A", "h"))).toBe(true);
  });

  it("КРЕСТИ БЬЮТСЯ ТОЛЬКО КРЕСТЯМИ — козырь их не берёт", () => {
    expect(beats(c("A", "d"), c("6", "c")), "туз буби не бьёт шестёрку крестей").toBe(false);
    expect(beats(c("A", "s"), c("6", "c"))).toBe(false);
    expect(beats(c("7", "c"), c("6", "c"))).toBe(true);
    expect(beats(c("6", "c"), c("7", "c"))).toBe(false);
  });

  it("крести сами бьют кого угодно по обычному закону козыря? нет — только как своя масть", () => {
    expect(beats(c("A", "c"), c("6", "s")), "крести не козырь: чужую масть не берут").toBe(false);
  });

  it("ДЖОКЕР БЬЁТ ЛЮБУЮ КАРТУ, даже туза козыря", () => {
    expect(beats(RED, c("A", "d"))).toBe(true);
    expect(beats(BLACK, c("A", "c"))).toBe(true);
  });

  it("джокер бьёт джокера", () => {
    expect(beats(RED, BLACK)).toBe(true);
    expect(beats(BLACK, RED)).toBe(true);
  });

  it("ЛЮБАЯ ШЕСТЁРКА БЬЁТ ДЖОКЕРА — и это сильнее джокерского закона", () => {
    expect(beats(c("6", "s"), RED)).toBe(true);
    expect(beats(c("6", "c"), BLACK)).toBe(true);
    expect(beats(c("6", "d"), RED)).toBe(true);
  });

  it("а семёрка джокера уже не бьёт", () => {
    expect(beats(c("7", "s"), RED)).toBe(false);
    expect(beats(c("A", "d"), BLACK)).toBe(false);
  });
});

describe("круг: порог берётся при старте и внутри не меняется", () => {
  it("первым ходит тот, у кого шестёрка буби", () => {
    expect(firstMover({ Аня: [c("K", "s")], Боря: [c("6", "d"), c("7", "h")] })).toBe("Боря");
    expect(firstMover({ Аня: [c("K", "s")], Боря: [c("6", "c")] }), "ни у кого — некому").toBe(null);
  });

  it("круг из одной карты при двух игроках ещё не закрыт", () => {
    const circle = openCircle(c("6", "d"), 2);
    expect(closed(circle)).toBe(false);
    expect(top(circle)).toEqual(c("6", "d"));
    expect(bottom(circle)).toEqual(c("6", "d"));
  });

  it("карт стало по числу игроков, начинавших круг, — круг закрылся", () => {
    const circle = lay(openCircle(c("6", "d"), 2), c("7", "d"));
    expect(closed(circle)).toBe(true);
  });

  it("порог — тот, что взят при СТАРТЕ: вышедший посреди круга его не понижает", () => {
    // Круг начали втроём. Один остался без карт — порог всё равно три.
    let circle = openCircle(c("6", "d"), 3);
    circle = lay(circle, c("7", "d"));
    expect(closed(circle), "двух карт мало: начинали втроём").toBe(false);
    circle = lay(circle, c("8", "d"));
    expect(closed(circle)).toBe(true);
  });

  it("забрали нижнюю — верхняя осталась, и бить её следующему", () => {
    let circle = openCircle(c("6", "d"), 3);
    circle = lay(circle, c("7", "d"));
    const { circle: after, card } = takeBottom(circle);
    expect(card).toEqual(c("6", "d"));
    expect(after.table).toEqual([c("7", "d")]);
    expect(top(after)).toEqual(c("7", "d"));
    expect(closed(after), "одна карта при пороге три — круг жив").toBe(false);
  });

  it("стол разобрали до конца — круг закрыт", () => {
    const circle = openCircle(c("6", "d"), 3);
    expect(closed(takeBottom(circle).circle)).toBe(true);
  });
});

describe("кто начинает следующий круг", () => {
  const ring = ["Аня", "Боря", "Вика"];

  it("круг закрыт положенной картой — начинает тот, кто её положил", () => {
    expect(nextOpener({ by: "laid", who: "Боря" }, ring)).toBe("Боря");
  });

  it("круг закрыт тем, что стол разобрали — начинает следующий за последним взявшим", () => {
    expect(nextOpener({ by: "taken", who: "Боря" }, ring)).toBe("Вика");
    expect(nextOpener({ by: "taken", who: "Вика" }, ring), "по кругу").toBe("Аня");
  });

  it("закрывший вышел из игры — очередь достаётся тому, кто остался", () => {
    expect(nextOpener({ by: "laid", who: "Боря" }, ["Аня", "Вика"])).toBe("Аня");
  });
});

describe("выход, проигравший и раздающий", () => {
  it("выходят только пустые руки", () => {
    expect(leaving({ Аня: [], Боря: [c("6", "s")], Вика: [] }).sort()).toEqual(["Аня", "Вика"]);
  });

  it("последний с картами — проигравший, он же следующий раздающий", () => {
    expect(loser({ Аня: [], Боря: [c("6", "s")], Вика: [] })).toBe("Боря");
    expect(loser({ Аня: [], Боря: [c("6", "s")], Вика: [c("7", "s")] }), "их двое — партия не кончена").toBe(null);
  });

  it("САМЫЙ КОВАРНЫЙ СЛУЧАЙ: пустая рука внутри незакрытого круга — игрок всё ещё в круге", () => {
    // Аня положила последнюю карту, круг не закрылся (порог три, карт две).
    let circle = openCircle(c("6", "d"), 3);
    circle = lay(circle, c("7", "d"));
    const hands: Record<string, readonly Face[]> = { Аня: [], Боря: [c("8", "d")], Вика: [c("9", "s")] };
    expect(closed(circle), "круг ещё идёт").toBe(false);
    expect(leaving(hands), "выход считают ТОЛЬКО по закрытии круга — здесь его нет").toEqual(["Аня"]);
    // Очередь дошла до Ани, бить нечем — поднимает нижнюю и снова с картами.
    const { card } = takeBottom(circle);
    expect(card).toEqual(c("6", "d"));
  });
});

describe("конфиг стола мастодонта", () => {
  const faces: Record<string, Face> = { six: c("6", "s"), king: c("K", "s"), joker: RED };
  const ask: DeskAsk = { face: (id) => faces[id], pile: () => [], hand: () => [], admin: (k) => k === "админ" , croupier: () => false };

  it("кольцо объявлено зоной с позой, а не особым случаем в отрисовке", () => {
    const desk = krestDesk(() => null);
    expect(desk.zones).toEqual([{ id: RING, name: "Круг хода", x: 0, y: 0, pose: "ring", forever: true }]);
    expect(desk.zones[0]!.name, "у места есть имя для человека: его видно на грипе и в окне стопки").toBe("Круг хода");
  });

  it("«накрыть» у стола — это и есть старшинство игры", () => {
    const desk = krestDesk(() => null);
    expect(allowed(desk.says(ask, "card.cover", { by: "кто-то", card: "six", over: "joker" })), "шестёрка бьёт джокера").toBe(true);
    expect(allowed(desk.says(ask, "card.cover", { by: "кто-то", card: "king", over: "joker" })), "король джокера не бьёт").toBe(false);
  });

  it("грип кольца живой только у админа и у закрывшего круг", () => {
    const desk = krestDesk(() => ({ turn: null, closer: "Боря" }));
    expect(allowed(desk.says(ask, "pile.grip", { by: "админ", pile: RING }))).toBe(true);
    expect(allowed(desk.says(ask, "pile.grip", { by: "Боря", pile: RING }))).toBe(true);
    expect(allowed(desk.says(ask, "pile.grip", { by: "Вика", pile: RING }))).toBe(false);
    expect(allowed(desk.says(ask, "pile.grip", { by: "Вика", pile: "другая-стопка" })), "обычные стопки живут по-старому").toBe(true);
  });
});

describe("в кольцо кладёт только тот, чей ход", () => {
  const ask: DeskAsk = { face: () => undefined, pile: () => [], hand: () => [], admin: (k) => k === "админ" , croupier: () => false };
  const ring = { in: "deck" as const, pile: RING };
  const other = { in: "deck" as const, pile: "стопка" };

  it("партия идёт: чужому в кольцо нельзя, своему можно", () => {
    const desk = krestDesk(() => ({ turn: "Аня", closer: null }));
    expect(allowed(desk.says(ask, "pile.drop", { by: "Аня", card: "карта", at: ring }))).toBe(true);
    expect(allowed(desk.says(ask, "pile.drop", { by: "Боря", card: "карта", at: ring }))).toBe(false);
    expect(allowed(desk.says(ask, "pile.drop", { by: "Боря", card: "карта", at: other })), "прочие стопки очередь не сторожат").toBe(true);
    expect(allowed(desk.says(ask, "pile.drop", { by: "Боря", card: "карта", at: { in: "felt" } })), "и сукно тоже").toBe(true);
  });

  it("партии нет — стол ведёт себя как песочница: садись и раскладывай руками", () => {
    const desk = krestDesk(() => null);
    expect(allowed(desk.says(ask, "pile.drop", { by: "кто угодно", card: "карта", at: ring }))).toBe(true);
    expect(allowed(krestDesk(() => ({ turn: null, closer: null })).says(ask, "pile.drop", { by: "кто угодно", card: "карта", at: ring }))).toBe(true);
  });
});
