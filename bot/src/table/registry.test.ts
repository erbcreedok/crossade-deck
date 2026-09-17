import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { Registry } from "./registry.js";

const dirs: string[] = [];
const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), "reg-"));
  dirs.push(dir);
  return join(dir, "rooms.json");
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("память бота о своих столах", () => {
  it("помнит хозяина, дом и имя — и переживает перезапуск самого бота", () => {
    const file = fresh();
    const one = new Registry(file);
    one.remember("r1", { home: { kind: "inline", message: "m" }, by: "tg:1", title: "Стол «Обетованный щит»" });
    const again = new Registry(file);
    expect(again.all()).toEqual([["r1", { home: { kind: "inline", message: "m" }, by: "tg:1", title: "Стол «Обетованный щит»" }]]);
  });

  it("РОД СТОЛА ТОЖЕ ПЕРЕЖИВАЕТ ПЕРЕЗАПУСК: иначе крестовая комната вернётся песочницей", () => {
    const file = fresh();
    new Registry(file).remember("r1", { home: { kind: "chat", chat: "-1" }, by: "tg:1", title: "Крестовый. Алый обоз", kind: "krest" });
    expect(new Registry(file).all()[0]![1].kind).toBe("krest");
  });

  it("переименование и закрытие правят память", () => {
    const reg = new Registry(fresh());
    reg.remember("r1", { home: { kind: "chat", chat: "-1" }, by: "tg:1", title: "Стол «А»", kind: "krest" });
    reg.rename("r1", "Стол «Б»");
    expect(reg.all()[0]![1].kind, "переименование род не теряет").toBe("krest");
    expect(reg.all()[0]![1].title).toBe("Стол «Б»");
    reg.forget("r1");
    expect(reg.all()).toEqual([]);
    // Забытый стол переименовывать нечего — и это не ошибка.
    reg.rename("r1", "Стол «В»");
    expect(reg.all()).toEqual([]);
  });
});
