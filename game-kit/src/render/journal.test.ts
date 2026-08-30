// The dashcam: a rolling record of what the desk did, and a stamp the person at the glass puts on
// the moment they saw it go wrong.

import { afterEach, describe, expect, it } from "vitest";
import { journalDump, journalOn, mark, note, startJournal, stopJournal, trace, JOURNAL_SECONDS } from "./journal.js";

/** A clock the test winds by hand — the journal reads the time and never schedules anything. */
function hand() {
  let ms = 0;
  return { now: () => ms, wind: (by: number) => (ms += by) };
}

afterEach(() => stopJournal());

describe("journal", () => {
  it("journal.is-off-until-asked — a game that never wanted this pays nothing and records nothing", () => {
    expect(journalOn()).toBe(false);
    note("frame", { at: [1, 2] });
    mark("nothing is running");
    expect(journalDump()).toEqual({ seconds: 0, marks: 0, entries: [] });
    // And it comes back off, so one page recording does not leave every other page recording.
    startJournal();
    expect(journalOn()).toBe(true);
    stopJournal();
    expect(journalOn()).toBe(false);
    note("frame", {});
    expect(journalDump().entries).toEqual([]);
  });

  it("journal.writes-what-happened-in-the-order-it-happened — with the time it happened at", () => {
    const c = hand();
    startJournal({ now: c.now });
    note("frame", { drawn: { card: [1, 2] } });
    c.wind(16);
    note("pan", { state: "began" });
    c.wind(16);
    note("deal", { text: "off the pack" });
    const out = journalDump();
    expect(out.entries.map((e) => e.event)).toEqual(["frame", "pan", "deal"]);
    expect(out.entries.map((e) => e.at)).toEqual([0, 16, 32]);
    // The sort's own fields ride along beside `at` and `event`, flat, so a reader is not unwrapping.
    expect(out.entries[1]).toEqual({ at: 16, event: "pan", state: "began" });
    expect(out.seconds).toBeCloseTo(0.03, 2);
  });

  it("journal.is-a-RING — the last stretch is kept and the rest falls off the front", () => {
    // A dashcam's reason: nobody knows a recording was worth keeping until after the thing happens,
    // so it can be left running for as long as somebody is playing.
    const c = hand();
    startJournal({ seconds: 1, now: c.now });
    for (let i = 0; i < 200; i++) {
      note("frame", { i });
      c.wind(16);
    }
    const out = journalDump();
    expect(out.entries.length).toBeLessThan(70); // a second at sixty a second, not three seconds' worth
    expect(out.entries[out.entries.length - 1]!.i).toBe(199); // the newest is always kept
    const span = out.entries[out.entries.length - 1]!.at - out.entries[0]!.at;
    expect(span).toBeLessThanOrEqual(1000);
    expect(span).toBeGreaterThan(900); // and it really keeps the whole window, not a scrap of it
    // ONE entry always survives however long the gap: a recording with nothing in it says nothing
    // about what just happened, and a very quiet desk is still a desk.
    c.wind(60_000);
    note("frame", { i: "after a long quiet" });
    expect(journalDump().entries).toEqual([{ at: 63200, event: "frame", i: "after a long quiet" }]);
  });

  it("journal.a-mark-turns-somewhere-into-an-index — the one entry a person writes", () => {
    const c = hand();
    startJournal({ now: c.now });
    note("frame", { i: 0 });
    c.wind(500);
    expect(mark("it jumped here")).toBe(1);
    c.wind(500);
    expect(mark()).toBe(2);
    const out = journalDump();
    expect(out.marks).toBe(2);
    const marks = out.entries.filter((e) => e.event === "mark");
    expect(marks).toEqual([
      { at: 500, event: "mark", n: 1, text: "it jumped here" },
      { at: 1000, event: "mark", n: 2, text: "" },
    ]);
  });

  it("journal.the-take-is-trimmed-to-the-marks — frames near what somebody pointed at, and the whole story besides", () => {
    // The ring holds half a minute so that whatever just happened is IN it. Reading is the other
    // problem: half a minute of frames at sixty a second is the better part of a megabyte, and a
    // file nobody can read is the same as no file.
    const c = hand();
    startJournal({ now: c.now });
    for (let i = 0; i < 20; i++) {
      note("frame", { i });
      if (i === 4) note("pan", { state: "began" });
      if (i === 15) note("deal", { said: "off the pack" });
      c.wind(1000);
    }
    c.wind(-4000); // back to the sixteenth second, where the deal was
    mark("here");
    const out = journalDump({ around: 2 });
    const frames = out.entries.filter((e) => e.event === "frame").map((e) => e.i);
    expect(frames, "only the frames around the stamped moment").toEqual([14, 15, 16, 17, 18]);
    // EVERYTHING THAT IS NOT A FRAME SURVIVES WHOLE — a touch, a gesture's report and a game's own
    // decision are the story, they are few, and one of them missing is a hole in the account.
    expect(out.entries.filter((e) => e.event === "pan")).toHaveLength(1);
    expect(out.entries.filter((e) => e.event === "deal")).toHaveLength(1);
    expect(out.seconds, "and the span reported is the whole take, not the trimmed part").toBeGreaterThan(15);
    // Nothing stamped at all: the last stretch is kept, because somebody who saved without marking
    // meant "just now".
    stopJournal();
    startJournal({ now: c.now });
    for (let i = 0; i < 20; i++) {
      note("frame", { i });
      c.wind(1000);
    }
    expect(journalDump({ around: 2 }).entries.map((e) => e.i)).toEqual([17, 18, 19]);
  });

  it("journal.a-fresh-start-is-a-fresh-take — and numbers are rounded for a person to read", () => {
    const c = hand();
    startJournal({ now: c.now });
    note("frame", { i: 1 });
    mark();
    c.wind(100);
    startJournal({ now: c.now });
    note("frame", { i: 2 });
    const out = journalDump();
    expect(out.entries).toEqual([{ at: 0, event: "frame", i: 2 }]);
    expect(out.marks, "the count starts over too, or two takes have two mark ones").toBe(0);
    // The default window is a length of PLAYING, not a number of entries: whatever a page draws,
    // what is kept is the last stretch of what somebody did.
    expect(JOURNAL_SECONDS).toBe(30);
    expect(trace(1.23456789)).toBe(1.235);
    expect(trace(-0.0004)).toBe(-0);
  });
});
