// СТОРОЖ ДЕЙСТВИЙ НАД САМОЙ КОМНАТОЙ, КАК ИХ ИСПОЛНЯЕТ СТОЛ.
//
// Главное здесь — что у такого действия НЕТ «КОГО». Пока стол требовал имени от всякого действия,
// «поставить стул» и вся настройка комнаты уходили в никуда молча: сообщение без имени отбрасывалось
// первой же строкой обработчика, и кнопка выглядела сломанной.

import { describe, it, expect } from "vitest";
import { TEST_PORTS, useTestServer } from "./roomHarness.js";
import { createAccount } from "./accounts.js";
import { openRoom } from "./rooms.js";
import { addMember, roomById } from "./db/roomsRepo.js";

describe("KitRoom: действия над комнатой", () => {
  const server = useTestServer(TEST_PORTS.kitRoom);

  /** Стол с хозяином и одним админом, поднятый под вечной записью. */
  async function table(over: Record<string, unknown> = {}) {
    const boss = createAccount("Хозяин комнаты");
    const helper = createAccount("Админ комнаты");
    const record = openRoom({ game: "cards", chairs: 2, ownerAccount: boss.id, ...over })!;
    addMember(record.id, helper.id, "admin", true);
    const owner = await server().sdk.create("kit_room", {
      room: record.id,
      code: record.code,
      chairs: 2,
      accountId: boss.id,
    });
    const admin = await server().sdk.joinById(owner.roomId, { accountId: helper.id });
    return { record, owner, admin };
  }

  /** Что стол ответил отказом на это действие — или `undefined`, если он его сделал. */
  const refusal = (client: { onMessage: (k: string, f: (msg: { why: string }) => void) => unknown }): Promise<string | undefined> =>
    new Promise((done) => {
      client.onMessage("denied", (msg) => done(msg.why));
      setTimeout(() => done(undefined), 150);
    });

  it("настройка комнаты идёт БЕЗ имени — у действия над комнатой нет «кого»", async () => {
    const { record, owner } = await table();
    owner.send("deed", { deed: "room:public", value: "hidden" });
    owner.send("deed", { deed: "room:access", value: "invite" });
    await new Promise((r) => setTimeout(r, 150));
    const after = roomById(record.id)!;
    expect(after.visibility).toBe("hidden");
    expect(after.admission).toBe("invite");
  });

  it("стул тоже ставится без имени: это действие над столом, а не над человеком", async () => {
    const { record, owner } = await table();
    owner.send("deed", { deed: "seat:add" });
    await new Promise((r) => setTimeout(r, 150));
    expect(roomById(record.id)!.chairs).toBe(3);
  });

  it("выдуманное значение не проходит — комната остаётся при своём", async () => {
    const { record, owner } = await table();
    expect(await refusal(owner)).toBeUndefined();
    owner.send("deed", { deed: "room:mode", value: "монархия" });
    await new Promise((r) => setTimeout(r, 150));
    expect(roomById(record.id)!.mode).toBe("free");
  });

  it("хозяин снимает вечность сразу, админ — с отсрочкой, и отсрочку отменяют той же кнопкой", async () => {
    const { record, owner, admin } = await table({ forever: true });

    admin.send("deed", { deed: "room:forever" });
    await new Promise((r) => setTimeout(r, 150));
    const waiting = roomById(record.id)!;
    expect(waiting.forever).toBe(true);
    expect(waiting.foreverDropAt).not.toBeNull();

    // ТА ЖЕ КНОПКА ВОЗВРАЩАЕТ ГАЛОЧКУ, пока идёт отсрочка: иначе «отменить» пришлось бы искать
    // в другом месте, чем «снять».
    owner.send("deed", { deed: "room:forever" });
    await new Promise((r) => setTimeout(r, 150));
    expect(roomById(record.id)!.foreverDropAt).toBeNull();

    owner.send("deed", { deed: "room:forever" });
    await new Promise((r) => setTimeout(r, 150));
    expect(roomById(record.id)!.forever).toBe(false);
  });

  it("закрывает комнату хозяин, а админу сказано, почему нет", async () => {
    const { record, owner, admin } = await table();
    admin.send("deed", { deed: "room:close" });
    expect(await refusal(admin)).toBe("комнату закрывает хозяин");
    expect(roomById(record.id)!.closedAt).toBeNull();

    owner.send("deed", { deed: "room:close" });
    await new Promise((r) => setTimeout(r, 200));
    expect(roomById(record.id)!.closedAt).not.toBeNull();
  });
});
