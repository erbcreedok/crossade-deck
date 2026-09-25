// ДЕЛА КРУПЬЕ — ЧТО ГДЕ ЛЕЖИТ И ЧЕМУ ПРИНАДЛЕЖИТ.
//
// Кнопки лежали двумя кучами в разных концах окна, игровые вперемешку с хозяйственными, и понять,
// что за что отвечает, было нельзя. Раздел отвечает на вопрос «я сейчас про партию, про колоду, про
// руку крупье или про сам стол?» — и раздел у дела ровно один.
//
// ВТОРОЙ ЗАКОН ВАЖНЕЕ: дела ПАРТИИ живут только там, где партия есть. В песочнице нет ни круга, ни
// очереди — и «указать ход» с «указателем хода» там не кнопки, а загадка для человека.

import { describe, expect, it } from "vitest";
import { CREWS, CREW_PARTS, crewOf } from "./crews.js";

describe("crews.every-act-has-exactly-one-part", () => {
  it("у каждого дела есть раздел, и он из известных", () => {
    for (const [набор, crew] of Object.entries(CREWS)) {
      for (const act of crew.acts) {
        expect(CREW_PARTS, `${набор}/${act.id}`).toContain(act.part);
      }
    }
  });

  it("имена дел не повторяются внутри набора", () => {
    for (const [набор, crew] of Object.entries(CREWS)) {
      const ids = crew.acts.map((one) => one.id);
      expect(new Set(ids).size, набор).toBe(ids.length);
    }
  });
});

describe("crews.game-acts-live-only-where-the-game-is", () => {
  /** Дела, у которых нет смысла без партии: очередь, круг, указатель хода. */
  const игровые = ["ring", "ring-back", "point", "turn-mark"];

  it("в песочнице нет ни одного дела партии", () => {
    const есть = crewOf("sandbox").acts.map((one) => one.id);
    expect(есть.filter((id) => игровые.includes(id))).toEqual([]);
  });

  it("а у крестового они все на месте, и все — в разделе «игра»", () => {
    const acts = crewOf("krest").acts;
    for (const id of игровые) {
      const act = acts.find((one) => one.id === id);
      expect(act, id).toBeDefined();
      expect(act!.part, id).toBe("игра");
    }
  });

  it("дела песочницы есть и у крестового: стол у них общий", () => {
    const krest = new Set(crewOf("krest").acts.map((one) => one.id));
    for (const act of crewOf("sandbox").acts) expect(krest.has(act.id), act.id).toBe(true);
  });
});
