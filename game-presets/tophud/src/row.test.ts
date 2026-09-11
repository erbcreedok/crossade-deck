// THE GUARD ON THE ROW: `tophud.row-is-a-constant`. Everything here was proved on the stand before
// it was written down, and each of these was a way the strip broke while it was being turned.

import { describe, expect, it } from "vitest";
import { TOP_HUD_LOOK, topHudLook } from "./look.js";
import { peopleRow, type TopHudPerson } from "./row.js";

const NAMES = ["Ербол", "Марат", "Алия", "Дана", "Тимур", "Канат", "Асель", "Ринат", "Жанна", "Олег", "Салтанат", "Бекзат"];
const some = (n: number, away: readonly number[] = []): TopHudPerson[] =>
  Array.from({ length: n }, (_, i) => ({
    seat: `p${i + 1}`,
    name: NAMES[i % NAMES.length]!,
    ink: "seat-ink",
    ...(away.includes(i) ? { away: true } : {}),
  }));

describe("tophud.row-is-a-constant", () => {
  it("никогда не шире пяти аватаров впритык — сколько бы ни подсело", () => {
    const tight = TOP_HUD_LOOK.tight * TOP_HUD_LOOK.avatar;
    for (let n = 0; n <= 40; n++) {
      expect(peopleRow(some(n), TOP_HUD_LOOK).width).toBeLessThanOrEqual(tight);
    }
  });

  it("до пяти — вплотную и ровно по аватару на человека", () => {
    for (let n = 1; n <= TOP_HUD_LOOK.tight; n++) {
      const row = peopleRow(some(n), TOP_HUD_LOOK);
      expect(row.step).toBe(TOP_HUD_LOOK.avatar);
      expect(row.width).toBe(n * TOP_HUD_LOOK.avatar);
      expect(row.balls).toHaveLength(n);
    }
  });

  it("больше пяти — наплывают, и ряд остаётся шириной в пять", () => {
    for (let n = TOP_HUD_LOOK.tight + 1; n <= TOP_HUD_LOOK.maxBalls; n++) {
      const row = peopleRow(some(n), TOP_HUD_LOOK);
      expect(row.step).toBeLessThan(TOP_HUD_LOOK.avatar);
      expect(row.width).toBe(TOP_HUD_LOOK.tight * TOP_HUD_LOOK.avatar);
    }
  });

  it("левый поверх правого", () => {
    const faces = peopleRow(some(4), TOP_HUD_LOOK).balls;
    for (let i = 1; i < faces.length; i++) expect(faces[i]!.z).toBeLessThan(faces[i - 1]!.z);
  });

  it("на полосе максимум восемь кружков: семь лиц и плюс со счётом остальных", () => {
    const row = peopleRow(some(16), TOP_HUD_LOOK);
    expect(row.balls).toHaveLength(TOP_HUD_LOOK.maxBalls);
    expect(row.balls.filter((b) => b.kind === "face")).toHaveLength(TOP_HUD_LOOK.maxBalls - 1);
    expect(row.hidden).toBe(16 - (TOP_HUD_LOOK.maxBalls - 1));
    const more = row.balls.at(-1)!;
    expect(more.kind).toBe("more");
    if (more.kind === "more") expect(more.count).toBe(row.hidden);
  });

  it("плюс никем не закрывается — он не лицо, а число", () => {
    const row = peopleRow(some(16), TOP_HUD_LOOK);
    const more = row.balls.find((b) => b.kind === "more")!;
    for (const face of row.balls.filter((b) => b.kind === "face")) expect(more.z).toBeGreaterThan(face.z);
  });

  it("ровно восьмеро — это восемь лиц, а не семь и плюс один", () => {
    const row = peopleRow(some(TOP_HUD_LOOK.maxBalls), TOP_HUD_LOOK);
    expect(row.hidden).toBe(0);
    expect(row.balls.every((b) => b.kind === "face")).toBe(true);
  });

  it("пустой стол — пустой ряд без ширины", () => {
    const row = peopleRow([], TOP_HUD_LOOK);
    expect(row.balls).toHaveLength(0);
    expect(row.width).toBe(0);
  });

  it("«скрывать отошедших» убирает их из счёта, а не рисует прозрачными", () => {
    const row = peopleRow(some(4, [1, 2]), topHudLook({ away: "hide" }));
    expect(row.seated).toHaveLength(2);
    expect(row.balls).toHaveLength(2);
  });
});
