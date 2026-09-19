// ЖУРНАЛ ПОМНИТ ТО, ЧЕГО НЕ ПОМНИТ СОСТОЯНИЕ.
//
// Закон: строка журнала неизменна и упорядочена. По комнате она отдаётся лентой в том порядке, в
// каком случилась, — иначе проигрыватель покажет партию задом наперёд.

import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "./open.js";
import { tell, tellAll, deeds, deedsOf, roomsSeen, forget, MAX_WHAT_BYTES } from "./eventsRepo.js";

let at: ReturnType<typeof openDb>;

beforeEach(() => {
  at = openDb(":memory:");
});

const put = (kind: string, more: Partial<Parameters<typeof tell>[0]> = {}) =>
  tell({ at: 1000, room: "к1", who: "tg:7", side: "table", kind, ...more }, at);

describe("events.the-journal-remembers-what-state-forgets", () => {
  it("событие возвращается тем же, каким записано", () => {
    tell({ at: 1234, room: "к1", who: "tg:7", side: "table", kind: "act", what: { t: "take", card: "6♥" } }, at);
    const [one] = deedsOf("к1", 100, at);
    expect(one).toMatchObject({ at: 1234, room: "к1", who: "tg:7", side: "table", kind: "act" });
    expect(one.what).toEqual({ t: "take", card: "6♥" });
  });

  it("лента комнаты идёт в порядке случившегося, а не по времени на часах", () => {
    // Порядок держит номер строки, а не время: часы экрана игрока идут своим ходом и приезжают
    // вперемешку с часами стола. Поэтому время здесь нарочно идёт ВСПЯТЬ.
    put("join", { at: 3000 });
    put("act", { at: 2000, side: "screen" });
    put("refused", { at: 1000 });
    expect(deedsOf("к1", 100, at).map((d) => d.kind)).toEqual(["join", "act", "refused"]);
  });

  it("чужая комната в ленту не попадает", () => {
    put("act");
    put("act", { room: "к2" });
    expect(deedsOf("к1", 100, at)).toHaveLength(1);
  });

  it("событие без комнаты и без человека записывается", () => {
    tell({ at: 1, side: "screen", kind: "boom", what: { text: "упало до входа" } }, at);
    expect(deeds({ kind: "boom" }, at)).toHaveLength(1);
  });

  it("приметы складываются: комната и человек и вид", () => {
    put("act");
    put("act", { who: "tg:8" });
    put("mic", { who: "tg:8" });
    expect(deeds({ room: "к1", who: "tg:8", kind: "act" }, at).map((d) => d.kind)).toEqual(["act"]);
  });

  it("выборка отдаёт СВЕЖИЕ, но читается сверху вниз по времени", () => {
    for (let i = 0; i < 5; i += 1) put("act", { at: i });
    const got = deeds({ limit: 2 }, at);
    expect(got.map((d) => d.at)).toEqual([3, 4]);
  });

  it("окно по времени режет с обеих сторон", () => {
    for (const t of [10, 20, 30, 40]) put("act", { at: t });
    expect(deeds({ since: 20, until: 30 }, at).map((d) => d.at)).toEqual([20, 30]);
  });

  it("огромные подробности режутся, а строка всё равно пишется", () => {
    put("frame", { what: { spots: "я".repeat(MAX_WHAT_BYTES) } });
    const [one] = deedsOf("к1", 100, at);
    expect(one.what).toMatchObject({ cut: expect.any(Number) });
    expect(JSON.stringify(one.what).length).toBeLessThan(MAX_WHAT_BYTES);
  });

  it("подробности с 64-битным целым записываются, а не роняют журнал", () => {
    // `JSON.stringify` бросает на `bigint`, а такие числа приезжают по сети сами собой.
    put("frame", { what: { at: 1758300000000n, cards: 36 } });
    expect(deedsOf("к1", 100, at)[0]!.what).toEqual({ at: 1758300000000, cards: 36 });
  });

  it("совсем несериализуемые подробности не роняют журнал", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(() => put("frame", { what: loop })).not.toThrow();
    expect(deedsOf("к1", 100, at)[0]!.what).toMatchObject({ unreadable: expect.any(String) });
  });

  it("пачка пишется целиком или не пишется вовсе", () => {
    tellAll(
      [
        { at: 1, room: "к1", side: "screen", kind: "press" },
        { at: 2, room: "к1", side: "screen", kind: "press" },
      ],
      at,
    );
    expect(deedsOf("к1", 100, at)).toHaveLength(2);
  });

  it("пустая пачка не падает", () => {
    expect(() => tellAll([], at)).not.toThrow();
  });

  it("комнаты журнала перечисляются свежими вперёд", () => {
    put("act", { at: 100 });
    put("act", { at: 900, room: "к2" });
    expect(roomsSeen(10, at).map((r) => r.room)).toEqual(["к2", "к1"]);
    expect(roomsSeen(10, at)[1]).toMatchObject({ room: "к1", first: 100, last: 100, deeds: 1 });
  });

  it("старое забывается, свежее остаётся", () => {
    const now = 100 * 24 * 60 * 60 * 1000;
    put("act", { at: now - 40 * 24 * 60 * 60 * 1000 });
    put("act", { at: now - 1000 });
    expect(forget(now, 30, at)).toBe(1);
    expect(deedsOf("к1", 100, at)).toHaveLength(1);
  });
});
