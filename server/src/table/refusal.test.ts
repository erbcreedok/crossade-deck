// ОТКАЗ ДОХОДИТ ДО ЧЕЛОВЕКА СЛОВАМИ.
//
// Закон: у каждой причины, которую может назвать род стола, есть текст для игрока. Причина без
// текста — это молчаливый отказ, а молчаливый отказ человек читает как поломку и пробует снова: в
// живой партии втроём так набралось 35 отказов подряд с одним и тем же невнятным «занято».

import { describe, it, expect } from "vitest";
import { REFUSAL_SAYS, type Refusal } from "./contract.js";
import { WHYS } from "./access.js";

describe("refusal.a-refusal-reaches-the-player-in-words", () => {
  it("у каждой причины рода стола есть текст", () => {
    for (const why of WHYS) {
      expect(REFUSAL_SAYS[why as Refusal], `причина «${why}» ничего не говорит игроку`).toBeTruthy();
    }
  });

  it("технические причины молчат нарочно", () => {
    // Про рассинхрон и битый ход игроку сказать нечего: молчание честнее выдуманного объяснения.
    for (const why of ["busy", "not-held", "bad"] as const) {
      expect(REFUSAL_SAYS[why]).toBe("");
    }
  });

  it("текстов ровно столько, сколько причин: лишних нет", () => {
    const said = Object.keys(REFUSAL_SAYS);
    expect(new Set(said).size).toBe(said.length);
  });

  it("«не твой ход» и «занято» — разные слова", () => {
    // Ровно то, что было сломано: род говорил «не твой ход», стол затирал это в «занято».
    expect(REFUSAL_SAYS["not-your-turn"]).not.toBe(REFUSAL_SAYS.locked);
  });
});
