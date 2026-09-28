import { deskNames } from "../../../server/src/table/desks.js";
import { describe, expect, it } from "vitest";
import type { RoomCard } from "../../../server/src/table/contract.js";
import { cardRows, enter, inviteArticle, inviteExisting, KIND_RE, listed, mayManage, offerRoom, opened } from "./talk.js";

const links = { anywhere: (r: string) => `https://t.me/bot/table?startapp=${r}`, app: (r: string) => `https://fly/t/?room=${r}`, native: () => null };
const withApp = { ...links, native: (r: string) => `https://t.me/bot?start=app-${r}` };
const card = (room: string, title: string, by = "tg:1"): RoomCard => ({ room, title, by, home: { kind: "chat", chat: "-1" }, people: [], seats: [], deck: { size: 36, jokers: false }, createdAt: 0, kind: "sandbox", crew: "sandbox", admins: [] });

describe("слова бота про комнаты", () => {
  it("рядом с каждым «Играть» — «В приложении»: ведёт в личку с ботом, пропуск он выдаст там лично", () => {
    const native = { text: "В приложении", url: "https://t.me/bot?start=app-r1" };
    expect(cardRows("r1", withApp, false)[0]).toEqual([{ text: "Играть", url: "https://t.me/bot/table?startapp=r1" }, native, { text: "Меню", data: "tbm:r1" }]);
    expect(cardRows("r1", withApp, true)[0]![1]).toEqual(native);
    expect(listed([card("r1", "«Чат»", "tg:1"), card("r2", "«Бандиты»", "tg:9")], withApp, true, "tg:1").rows.map((r) => r[1])).toEqual([native, { text: "В приложении", url: "https://t.me/bot?start=app-r2" }]);
    expect(inviteExisting(card("r1", "«Пицца»"), withApp, false).rows[0]).toEqual([{ text: "Играть", url: "https://t.me/bot/table?startapp=r1" }, native]);
  });


  it("в личке — все мои комнаты: своими управляю, в чужие просто захожу", () => {
    const said = listed([card("r1", "«Чат»", "tg:1"), card("r2", "«Бандиты»", "tg:9")], links, true, "tg:1");
    expect(said.text).toContain("Твои комнаты (2)");
    expect(said.text).toContain("«Чат» · твой");
    expect(said.rows[0]).toHaveLength(4);
    expect(said.rows[1]).toHaveLength(1);
    expect(said.rows[1]![0]).toEqual({ text: "«Бандиты»", app: "https://fly/t/?room=r2" });
  });

  it("в личке видно, где стол живёт: чат по имени, переписка — «в переписке»", () => {
    const inChat: RoomCard = { room: "r1", title: "«Пицца»", by: "tg:1", home: { kind: "chat", chat: "-1", chatTitle: "Пицца" }, people: [], seats: [], deck: { size: 36, jokers: false }, createdAt: 0, kind: "sandbox", crew: "sandbox", admins: [] };
    const inline: RoomCard = { room: "r2", title: "«Ржавый обоз»", by: "tg:1", home: { kind: "inline", message: "m" }, people: [], seats: [], deck: { size: 36, jokers: false }, createdAt: 0, kind: "sandbox", crew: "sandbox", admins: [] };
    const said = listed([inChat, inline], links, true, "tg:1");
    expect(said.text).toContain("чат «Пицца»");
    expect(said.text).toContain("в переписке");
  });

  it("готовый стол карточкой в чужую переписку: админу — «Управлять», остальным только вход", () => {
    const one: RoomCard = { room: "r1", title: "«Пицца»", by: "tg:1", home: { kind: "chat", chat: "-1", chatTitle: "Пицца" }, people: [], seats: [], deck: { size: 36, jokers: false }, createdAt: 0, kind: "sandbox", crew: "sandbox", admins: [] };
    const asAdmin = inviteExisting(one, links, true);
    expect(asAdmin.title).toBe("«Пицца»");
    expect(asAdmin.description).toContain("чат «Пицца»");
    expect(asAdmin.text).toContain("«Пицца»");
    expect(asAdmin.rows[0]).toHaveLength(2);
    expect(asAdmin.rows[0]![1]).toEqual({ text: "Управлять", data: "tbm:r1" });
    // В чужой переписке вход — ссылкой: `web_app` Telegram там не покажет.
    expect(asAdmin.rows[0]![0]).toEqual({ text: "Играть", url: "https://t.me/bot/table?startapp=r1" });
    expect(inviteExisting(one, links, false).rows[0]).toHaveLength(1);
  });

  it("в личке без комнат — не «в этом чате», а про меня", () => {
    expect(listed([], links, true, "tg:1").text).toContain("Ты пока ни в одной комнате");
  });

  it("в личке — Mini App кнопкой, в группе — ссылкой (web_app в группах Telegram не показывает)", () => {
    expect(enter("r1", links, true)).toEqual({ text: "Играть", app: "https://fly/t/?room=r1" });
    expect(enter("r1", links, false)).toEqual({ text: "Играть", url: "https://t.me/bot/table?startapp=r1" });
  });

  it("вторая комната в чате — бот говорит, сколько их теперь", () => {
    expect(opened(card("r1", "Дурак"), 1, links, false).text).toBe("«Дурак» открыта.");
    expect(opened(card("r2", "Покер"), 2, links, false).text).toContain("комнат: 2");
  });

  it("список: у каждого комнаты вход, меню управления, переименование и закрытие", () => {
    const said = listed([card("r1", "Дурак"), card("r2", "Покер")], links, false);
    expect(said.rows.map((row) => row.map((b) => b.text))).toEqual([
      ["Дурак", "Управлять", "Переименовать", "Закрыть"],
      ["Покер", "Управлять", "Переименовать", "Закрыть"],
    ]);
  });
});

describe("/room: сперва спросить, потом открыть", () => {
  it("кнопка на каждый род и «Отмена»; все влезают в callback_data и проходят разбор бота", () => {
    const said = offerRoom("Пицца", deskNames(), "abc123");
    expect(said.text).toContain("«Пицца»");
    const all = said.rows.flat();
    expect(all.at(-1)).toEqual({ text: "Отмена", data: "tbo:no:abc123" });
    expect(all.length).toBe(deskNames().length + 1);
    const re = new RegExp(`^tbo:(no|${KIND_RE}):([a-z0-9]+)$`);
    for (const b of all) {
      expect("data" in b && re.test(b.data)).toBe(true);
      if ("data" in b) expect(Buffer.byteLength(b.data)).toBeLessThanOrEqual(64);
    }
  });
});

describe("каким столом я вправе распоряжаться", () => {
  const here = new Set(["r-here"]);
  it("стол этого чата — можно, даже если завёл его не я", () => {
    expect(mayManage({ room: "r-here", by: "tg:9" }, "tg:1", here)).toBe("yes");
  });

  it("свой стол из другого чата — тоже можно: кнопки ищут там же, где взят список", () => {
    expect(mayManage({ room: "r-afar", by: "tg:1" }, "tg:1", here)).toBe("yes");
  });

  it("чужой стол, за которым я лишь сижу, — нельзя", () => {
    expect(mayManage({ room: "r-afar", by: "tg:9" }, "tg:1", here)).toBe("foreign");
  });

  it("комнаты нет вовсе — так и говорим", () => {
    expect(mayManage(undefined, "tg:1", here)).toBe("gone");
    expect(mayManage({ room: "r-afar" }, "tg:1", here)).toBe("foreign");
  });
});

describe("карточка нового комнаты: род выбирается здесь", () => {
  it("у каждого рода своя карточка, и род назван человеческим именем", () => {
    const by = Object.fromEntries(deskNames().map((d) => [d.id, d]));
    const card = (id: string) => inviteArticle(by[id]!.name, by[id]!.about, id, links);
    expect(card("sandbox").title).toContain("песочница");
    expect(card("krest").title).toContain("крестовый");
    expect(card("sandbox").description, "у песочницы правил нет — так и сказано").toContain("без правил");
    expect(card("krest").description).toContain("крестовый");
  });

  it("каждый род из каталога проходит разбор бота — иначе выбранный род молча теряется", () => {
    const kind = new RegExp(`^${KIND_RE}$`);
    for (const { id } of deskNames()) expect(id, `род «${id}»`).toMatch(kind);
    expect("tbl:some-kind:r1", "род с дефисом").toMatch(new RegExp(`^tbl:(${KIND_RE}):(.+)$`));
  });

  it("у открытого комнаты есть вход и «Меню» — управление хозяину", () => {
    const rows = cardRows("r1", links, false);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.map((b) => b.text)).toEqual(["Играть", "Меню"]);
    expect(rows[0]![1]).toEqual({ text: "Меню", data: "tbm:r1" });
  });
});
