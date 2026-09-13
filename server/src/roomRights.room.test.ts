// СТОРОЖ ПРАВ НА САМУ КОМНАТУ — код, видимость, допуск, уклад, вечность, копия, закрытие.
//
// Права на комнату отдельны от прав на человека, и это не мелочь: пока они жили одним списком,
// «сменить код» стояло в строке каждого имени и читалось как действие над этим человеком.

import { describe, expect, it } from "vitest";
import { may, roomDeeds, ROOM_DEEDS, type Someone } from "./roomRights.js";

const owner: Someone = { account: "o", role: "owner", seated: true, here: true };
const admin: Someone = { account: "a", role: "admin", seated: true, here: true };
const player: Someone = { account: "p", role: "player", seated: true, here: true };
const watcher: Someone = { account: "w", role: "player", seated: false, here: true };

describe("права на комнату", () => {
  it("ссылка есть у каждого за столом — даже у зрителя: позвать друга не власть", () => {
    for (const one of [owner, admin, player, watcher]) expect(may("room:link", one, one, "free")).toBe(true);
  });

  it("настройки комнаты в вольнице — у хозяина и админа, игроку сказано почему нет", () => {
    for (const deed of ["room:code", "room:public", "room:access", "room:forever"] as const) {
      expect(may(deed, owner, owner, "free")).toBe(true);
      expect(may(deed, admin, admin, "free")).toBe(true);
      expect(may(deed, player, player, "free")).toMatch(/распоряжается/);
    }
  });

  it("уклад меняют только админы, и даже в вече — иначе игроки голосованием отменяют вече", () => {
    expect(may("room:mode", player, player, "assembly")).toBe("уклад меняют админы");
    expect(may("room:mode", admin, admin, "assembly")).toBe(true);
  });

  it("копию делает не хозяин: у него она и так своя", () => {
    expect(may("room:fork", owner, owner, "free")).toBe("она и так твоя");
    expect(may("room:fork", admin, admin, "free")).toBe(true);
    expect(may("room:fork", watcher, watcher, "free")).toMatch(/распоряжается/);
  });

  it("закрывает комнату только хозяин — админу отказано словами", () => {
    expect(may("room:close", owner, owner, "free")).toBe(true);
    expect(may("room:close", admin, admin, "free")).toBe("комнату закрывает хозяин");
  });

  it("в совете разрешённое становится предложением — но ссылка остаётся ссылкой", () => {
    const { can } = roomDeeds(admin, "council");
    expect(can.find((one) => one.deed === "room:link")?.vote).toBe(false);
    expect(can.find((one) => one.deed === "room:public")?.vote).toBe(true);
    expect(can.find((one) => one.deed === "room:public")?.label).toMatch(/^Предложить/);
  });

  it("на всякое отказанное есть причина, и ни одно право не потеряно", () => {
    const { can, cant } = roomDeeds(watcher, "free");
    expect([...can, ...cant].map((one) => one.deed).sort()).toEqual([...ROOM_DEEDS].sort());
    for (const one of cant) expect(one.why.length).toBeGreaterThan(0);
  });
});
