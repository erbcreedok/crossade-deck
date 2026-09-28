// ПРОПУСК В ПРИЛОЖЕНИЕ ПЕРЕНОСИТ ОДНОГО ЧЕЛОВЕКА ЗА ОДИН СТОЛ И НЕНАДОЛГО.
//
// Закон: пропуск нельзя подделать, пережить, перенести на другой стол или другого человека, и пропуск на
// запись партии за него не сойдёт.

import { describe, it, expect } from "vitest";
import { appKeyBearer, appPassBearer, mintAppKey, mintAppPass } from "./appPass.js";
import { mintPass } from "./pass.js";
import { whoIs } from "./identity.js";

const SECRET = "секрет-стола";
const SOON = 10_000;
const ME = { key: "tg:42", name: "Ербол", username: "erbol", photo: "https://t.me/i/userpic/320/x.jpg" };

describe("app-pass.one-person-one-table-not-for-long", () => {
  it("свой пропуск называет своего человека", () => {
    expect(appPassBearer(mintAppPass("стол1", ME, SECRET, SOON), "стол1", SECRET, 0)).toEqual(ME);
  });

  it("протухший не пускает", () => {
    const pass = mintAppPass("стол1", ME, SECRET, SOON);
    expect(appPassBearer(pass, "стол1", SECRET, SOON - 1)).not.toBeNull();
    expect(appPassBearer(pass, "стол1", SECRET, SOON + 1)).toBeNull();
  });

  it("за другой стол не пускает", () => {
    expect(appPassBearer(mintAppPass("стол1", ME, SECRET, SOON), "стол2", SECRET, 0)).toBeNull();
  });

  it("чужой подписью не открыть", () => {
    expect(appPassBearer(mintAppPass("стол1", ME, "другой", SOON), "стол1", SECRET, 0)).toBeNull();
  });

  it("человека в пропуске не подменить", () => {
    const [, until, mark] = mintAppPass("стол1", ME, SECRET, SOON).split(".");
    const other = Buffer.from(JSON.stringify({ key: "tg:1", name: "Чужой" })).toString("base64url");
    expect(appPassBearer(`${other}.${until}.${mark}`, "стол1", SECRET, 0)).toBeNull();
  });

  it("пропуск на запись партии за пропуск в приложение не сходит", () => {
    const replay = mintPass("стол1", SECRET, SOON);
    expect(appPassBearer(replay, "стол1", SECRET, 0)).toBeNull();
    expect(appPassBearer(replay.slice("стол1.".length), "стол1", SECRET, 0)).toBeNull();
  });

  it("мусор не пускает", () => {
    for (const raw of [undefined, null, 5, "", "a.b", "a.b.c", "...", "a.b.c.d"]) expect(appPassBearer(raw, "стол1", SECRET, 0)).toBeNull();
  });

  it("дверь `app`: стол узнаёт того же человека, что и через Telegram", () => {
    const pass = mintAppPass("стол1", ME, SECRET, Date.now() + SOON);
    expect(whoIs({ door: "app", pass, room: "стол1" }, "s1", { guests: false, secret: SECRET })).toEqual({ ...ME, door: "app" });
    expect(whoIs({ door: "app", pass, room: "стол2" }, "s1", { guests: false, secret: SECRET })).toBeNull();
    expect(whoIs({ door: "app", pass, room: "стол1" }, "s1", { guests: false })).toBeNull();
  });
});

describe("app-key.names-a-person-for-any-table", () => {
  it("ключ называет человека и пускает за любой стол", () => {
    const key = mintAppKey(ME, SECRET, Date.now() + SOON);
    expect(appKeyBearer(key, SECRET)).toEqual(ME);
    expect(whoIs({ door: "app", key, room: "стол1" }, "s", { guests: false, secret: SECRET })).toEqual({ ...ME, door: "app" });
    expect(whoIs({ door: "app", key, room: "стол2" }, "s", { guests: false, secret: SECRET })).toEqual({ ...ME, door: "app" });
  });

  it("протухший, чужой подписью или подменённый человек — не пускает", () => {
    const key = mintAppKey(ME, SECRET, SOON);
    expect(appKeyBearer(key, SECRET, SOON + 1)).toBeNull();
    expect(appKeyBearer(mintAppKey(ME, "другой", Date.now() + SOON), SECRET)).toBeNull();
    const [, until, mark] = mintAppKey(ME, SECRET, Date.now() + SOON).split(".");
    expect(appKeyBearer(`${Buffer.from(JSON.stringify({ key: "tg:1", name: "Чужой" })).toString("base64url")}.${until}.${mark}`, SECRET)).toBeNull();
  });

  it("пропуск на стол за ключ не сходит, и ключ за пропуск тоже", () => {
    const pass = mintAppPass("стол1", ME, SECRET, Date.now() + SOON);
    expect(appKeyBearer(pass, SECRET)).toBeNull();
    expect(appPassBearer(mintAppKey(ME, SECRET, Date.now() + SOON), "стол1", SECRET)).toBeNull();
  });
});
