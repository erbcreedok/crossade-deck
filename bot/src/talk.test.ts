// СТОРОЖ `bot.the-conversation-asks-where-the-person-is-standing`.
//
// Человек только что нажал «Запустить» в телеге. Спрашивать его на странице, куда он ещё не
// вернулся, — значит терять его на полпути: половина не вернётся, и профиль останется с кличкой.
//
// И второе: бот ждёт напечатанный ответ только от того, кто его попросил, и не вечно. Ожидание без
// срока — это бот, который через сутки принимает случайное сообщение за имя.

import { describe, expect, it } from "vitest";
import { askFor, buttonsFor, cleanName, linkedSaid, nextSaid, stopWaiting, waitingIn, WAIT_MS } from "./talk.js";

const NOW = 1_800_000_000_000;

describe("bot.the-conversation-asks-where-the-person-is-standing", () => {
  it("первая фраза называет человека здешним именем и предлагает выбор", () => {
    const said = linkedSaid("Драный олень", { kind: "name", name: "Ербол Сыздык" });
    expect(said).toContain("«Драный олень»");
    expect(said).toContain("«Ербол Сыздык»");
    expect(said).toContain("ввести своё");
  });

  it("спрашивать нечего — человека отправляют обратно на страницу, а не молчат", () => {
    expect(linkedSaid("Ербол", { kind: "none" })).toContain("Возвращайся на страницу");
  });

  it("на каждый ответ — своя кнопка: оставить, взять, ввести", () => {
    const rows = buttonsFor({ kind: "name", name: "Ербол" });
    expect(rows.map((row) => row[0]!.data)).toEqual(["keep:name", "take:name", "type:name"]);
    expect(rows[1]![0]!.text).toContain("Ербол");
  });

  it("у аватара те же три ответа, и «прислать свой» среди них", () => {
    const rows = buttonsFor({ kind: "photo" });
    expect(rows.map((row) => row[0]!.data)).toEqual(["keep:photo", "take:photo", "type:photo"]);
  });

  it("спрашивать нечего — кнопок нет вовсе", () => {
    expect(buttonsFor({ kind: "none" })).toEqual([]);
    expect(nextSaid({ kind: "none" })).toBeUndefined();
  });

  it("после имени спрашивают про лицо — по одному вопросу за раз", () => {
    expect(nextSaid({ kind: "photo" })).toContain("аватар");
  });
});

describe("бот ждёт ответ", () => {
  it("ждёт от того, кто попросил, и в его чате", () => {
    askFor(42, "name", "70001", NOW);
    expect(waitingIn(42, NOW)?.telegramId).toBe("70001");
    expect(waitingIn(43, NOW)).toBeUndefined();
    stopWaiting(42);
  });

  it("ждёт не вечно: через десять минут это уже не разговор", () => {
    stopWaiting(42);
    askFor(42, "name", "70001", NOW);
    expect(waitingIn(42, NOW + WAIT_MS - 1)).toBeDefined();
    expect(waitingIn(42, NOW + WAIT_MS)).toBeUndefined();
  });

  it("ответил — больше не ждут", () => {
    askFor(42, "photo", "70001", NOW);
    stopWaiting(42);
    expect(waitingIn(42, NOW)).toBeUndefined();
  });
});

describe("имя из телеги", () => {
  it("обрезается по той же мерке, что и в профиле", () => {
    expect(cleanName("Я".repeat(40))?.length).toBe(24);
  });

  it("лишние пробелы схлопываются", () => {
    expect(cleanName("  Ербол   Сыздык  ")).toBe("Ербол Сыздык");
  });

  it("пустое имя именем не считается", () => {
    expect(cleanName("   ")).toBeUndefined();
    expect(cleanName(undefined)).toBeUndefined();
  });
});
