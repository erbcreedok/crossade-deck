import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { cleanTune, partName, setTunes, tuneOf } from "../table/tunes.js";
import { MIGRATIONS } from "./migrations.js";
import { allTunes, putTune } from "./tableTunesRepo.js";

const fresh = () => {
  const d = new DatabaseSync(":memory:");
  for (const m of MIGRATIONS) m.up(d);
  return d;
};

describe("правки частей скина", () => {
  it("правка обрезается по границам, лишнее отбрасывается, пустая — null", () => {
    expect(cleanTune({ scale: 9, dx: -1.23456, shoulder: 2, junk: 1, name: "  Лис  " })).toEqual({ scale: 3, dx: -1.235, shoulder: 1, name: "Лис" });
    expect(cleanTune({ scale: "2", name: " " })).toBeNull();
  });

  it("пишется, читается, снимается — и снятие двигает время перемен", () => {
    const d = fresh();
    putTune("king:head", { scale: 1.4 }, 10, d);
    expect(allTunes(d)).toEqual({ parts: { "king:head": { scale: 1.4 } }, at: 10 });
    putTune("king:head", null, 20, d);
    expect(allTunes(d)).toEqual({ parts: {}, at: 20 });
  });

  it("клиент читает правку с обычными значениями на месте несданных; чужие части отбрасываются", () => {
    setTunes({ parts: { "king:head": { dy: 0.5, name: "Царь" }, "nope:head": { scale: 2 } }, at: 1 });
    expect(tuneOf("king:head")).toEqual({ scale: 1, dx: 0, dy: 0.5, shoulder: undefined });
    expect(tuneOf("nope:head").scale).toBe(1);
    expect(partName("king:head")).toBe("Царь");
    expect(partName("queen:head")).toBe("Дама бубен");
    setTunes({ parts: {}, at: 0 });
  });
});
