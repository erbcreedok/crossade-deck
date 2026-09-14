import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { Watch } from "./watch.js";

const file = () => join(mkdtempSync(join(tmpdir(), "watch-")), "chats.json");

describe("сторож столов", () => {
  it("пока запуск тот же — молчит", () => {
    const w = new Watch(file());
    w.remember("-1", "r1", "Дурак", "b1");
    expect(w.check({ up: true, url: "u", boot: "b1" })).toEqual([]);
  });

  it("новый запуск — говорит каждому чату про его столы, один раз", () => {
    const w = new Watch(file());
    w.remember("-1", "r1", "Дурак", "b1");
    w.remember("-1", "r2", "Покер", "b1");
    w.remember("-2", "r3", "Стол", "b1");
    const said = w.check({ up: true, url: "u", boot: "b2" });
    expect(said.map((s) => s.chat)).toEqual(["-1", "-2"]);
    expect(said[0]!.text).toContain("«Дурак», «Покер»");
    expect(w.check({ up: true, url: "u", boot: "b2" })).toEqual([]);
  });

  it("сервер замолчал — «выключился»; закрытый ботом стол в сообщение не попадает", () => {
    const w = new Watch(file());
    w.remember("-1", "r1", "Дурак", "b1");
    w.remember("-1", "r2", "Покер", "b1");
    w.forget("-1", "r1");
    const [said] = w.check({ up: false });
    expect(said!.text).toBe("Сервер стола выключился, столы закрылись: «Покер».");
  });

  it("память переживает перезапуск самого бота", () => {
    const f = file();
    new Watch(f).remember("-1", "r1", "Дурак", "b1");
    expect(new Watch(f).check({ up: false })).toHaveLength(1);
  });
});
