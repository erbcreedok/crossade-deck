import { describe, expect, it } from "vitest";
import { seatOccupants, withOccupants } from "./liveSeats";
import { sandboxBoard } from "./board";
import { DEFAULT_SANDBOX_SETTINGS } from "./settings";
import { initialState } from "../boards/state";

const member = (id: string, name: string, seat: string | null) => ({ id, name, color: 0xffffff, seat });

describe("рассадка live-комнаты", () => {
  it("за столом только живые участники из ростера; пустые стулья свободны, призрак места не берёт", () => {
    const occ = seatOccupants(
      [member("a", "Красная панда", "p1"), member("b", "Синяя сова", "p3"), member("g", "призрак", null)],
      4,
    );
    expect(occ).toEqual(["Красная панда", null, "Синяя сова", null]);
  });

  it("withOccupants переписывает рассадку снимка, не трогая карты: никаких мок-фантомов «Игрок N»", () => {
    const spec = sandboxBoard({ ...DEFAULT_SANDBOX_SETTINGS, seats: 4 });
    const boot = initialState(spec, 4); // standalone-бут селит фантомов —
    expect(boot.seats.map((s) => s.occupant)).toEqual(["Игрок 1", "Игрок 2", "Игрок 3", "Игрок 4"]);
    const live = withOccupants(boot, seatOccupants([member("a", "Рыжая лиса", "p1")], 4));
    expect(live.seats.map((s) => s.occupant)).toEqual(["Рыжая лиса", null, null, null]);
    expect(live.field).toBe(boot.field); // карты не тронуты
  });
});
