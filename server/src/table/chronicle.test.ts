// ЖУРНАЛ НЕ ИМЕЕТ ПРАВА УРОНИТЬ СТОЛ.
//
// Закон: что бы ни случилось с записью — стол продолжает игру. И обратный: записанное не теряется
// молча из-за того, что копилось пачкой.

import { describe, it, expect, vi } from "vitest";
import type { Deed } from "../db/eventsRepo.js";
import { Chronicle, BATCH_MAX } from "./chronicle.js";

const heard = () => {
  const got: Deed[] = [];
  return { got, write: (deeds: readonly Deed[]) => void got.push(...deeds) };
};

describe("chronicle.the-journal-may-never-break-the-table", () => {
  it("упавшая запись не выходит наружу", () => {
    const book = new Chronicle("к1", () => {
      throw new Error("диск полон");
    });
    book.tell("act", "tg:7");
    expect(() => book.flush()).not.toThrow();
  });

  it("стол пишет дальше после осечки", () => {
    let fall = true;
    const got: Deed[] = [];
    const book = new Chronicle("к1", (deeds) => {
      if (fall) throw new Error("заперта");
      got.push(...deeds);
    });
    book.tell("act", "tg:7");
    book.flush();
    fall = false;
    book.tell("join", "tg:8");
    book.flush();
    expect(got.map((d) => d.kind)).toEqual(["join"]);
  });

  it("событие уходит с комнатой и стороной стола", () => {
    const { got, write } = heard();
    const book = new Chronicle("к1", write);
    book.tell("act", "tg:7", { t: "take" }, 500);
    book.flush();
    expect(got[0]).toEqual({ at: 500, room: "к1", who: "tg:7", side: "table", kind: "act", what: { t: "take" } });
  });

  it("рассказ экрана помечен экраном, а не столом", () => {
    const { got, write } = heard();
    const book = new Chronicle("к1", write);
    book.heard([{ at: 5, kind: "press", what: { g: "tip" } }], "tg:7");
    book.flush();
    expect(got[0]).toMatchObject({ side: "screen", room: "к1", who: "tg:7", kind: "press" });
  });

  it("пачка уходит сама, когда переполнилась, без всякого таймера", () => {
    const { got, write } = heard();
    const book = new Chronicle("к1", write, 10_000);
    for (let i = 0; i < BATCH_MAX; i += 1) book.tell("act", "tg:7");
    expect(got).toHaveLength(BATCH_MAX);
    expect(book.waiting).toBe(0);
  });

  it("пачка уходит по таймеру", () => {
    vi.useFakeTimers();
    try {
      const { got, write } = heard();
      const book = new Chronicle("к1", write, 2000);
      book.tell("act", "tg:7");
      expect(got).toHaveLength(0);
      vi.advanceTimersByTime(2000);
      expect(got).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("сброс пустой летописи не ходит в базу", () => {
    const write = vi.fn();
    new Chronicle("к1", write).flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("сброс не отдаёт одно событие дважды", () => {
    const { got, write } = heard();
    const book = new Chronicle("к1", write);
    book.tell("act", "tg:7");
    book.flush();
    book.flush();
    expect(got).toHaveLength(1);
  });
});
