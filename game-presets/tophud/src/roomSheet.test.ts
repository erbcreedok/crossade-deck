// СТОРОЖ ЭКРАНА КОМНАТЫ: `tophud.the-room-screen-shows-what-it-cannot-change`.
//
// Прятать настройку от того, кому её не положено менять, нельзя: человек должен видеть, КАК устроен
// стол, за которым он сидит. Пропавший блок читается как поломка, и первым делом про него
// спрашивают «а где видимость». Поэтому запрещённое стоит ТУСКЛО и без ручки, а причина написана
// внизу, в «нельзя», — и это проверяется здесь, потому что глазами это проверяют один раз.

import { describe, expect, it } from "vitest";
import { roomSheetHtml, type TopHudRoom } from "./roomSheet.js";

const ROOM: TopHudRoom = {
  code: "TEST",
  title: "Карты",
  visibility: "public",
  admission: "code",
  mode: "free",
  forever: true,
};

const boss = (room: Partial<TopHudRoom> = {}): TopHudRoom => ({
  ...ROOM,
  ...room,
  can: [
    { deed: "room:link", label: "Ссылка" },
    { deed: "room:code", label: "Сменить код" },
    { deed: "room:public", label: "Видимость" },
    { deed: "room:access", label: "Допуск" },
    { deed: "room:mode", label: "Кто решает" },
    { deed: "room:forever", label: "Вечная комната" },
    { deed: "room:close", label: "Закрыть комнату" },
  ],
  cant: [{ deed: "room:fork", label: "Своя копия", why: "она и так твоя" }],
});

const watcher = (room: Partial<TopHudRoom> = {}): TopHudRoom => ({
  ...ROOM,
  ...room,
  can: [{ deed: "room:link", label: "Ссылка" }],
  cant: [
    { deed: "room:public", label: "Видимость", why: "видимость меняет тот, кто распоряжается" },
    { deed: "room:close", label: "Закрыть комнату", why: "комнату закрывает хозяин" },
  ],
});

describe("tophud.the-room-screen-shows-what-it-cannot-change", () => {
  it("зритель видит все заголовки — и ни одной ручки", () => {
    const html = roomSheetHtml({ room: watcher() });
    for (const word of ["ВИДИМОСТЬ", "ДОПУСК", "КТО РЕШАЕТ", "ВЕЧНАЯ КОМНАТА", "ХОЧЕШЬ СВОЮ ТАКУЮ ЖЕ"]) {
      expect(html).toContain(word);
    }
    expect(html).not.toContain(`data-room="room:public"`);
    expect(html).not.toContain(`data-room="room:forever"`);
    // ...а почему их нет — написано теми же словами, какими это сказал сервер.
    expect(html).toContain("НЕЛЬЗЯ");
    expect(html).toContain("комнату закрывает хозяин");
  });

  it("хозяину те же блоки даны ручками, и закрытие стоит отдельно, тревожным", () => {
    const html = roomSheetHtml({ room: boss() });
    expect(html).toContain(`data-room="room:public" data-value="hidden"`);
    expect(html).toContain(`data-room="room:access" data-value="invite"`);
    expect(html).toContain(`data-room="room:mode" data-value="free"`);
    expect(html).toContain(`data-room="room:close"`);
    expect(html).toContain("Закрыть комнату");
    // КОПИЯ ЕМУ НИ К ЧЕМУ, И ЭТО СКАЗАНО, А НЕ СПРЯТАНО.
    expect(html).not.toContain(`data-room="room:fork"`);
    expect(html).toContain("она и так твоя");
  });

  it("совет и вече видны, но не нажимаются: голосования ещё нет, и это написано на них", () => {
    const html = roomSheetHtml({ room: boss() });
    for (const word of ["вольница", "совет", "вече"]) expect(html).toContain(word);
    expect(html).not.toContain(`data-value="council"`);
    expect(html).not.toContain(`data-value="assembly"`);
    expect(html).toContain("скоро");
  });

  it("уклад, в котором комната УЖЕ живёт, остаётся подписан собой, а не «скоро»", () => {
    // ...иначе стол, однажды переведённый в совет, показывал бы «скоро» на своём же укладе, и
    // человеку негде было бы прочесть, по каким правилам он сейчас сидит.
    const html = roomSheetHtml({ room: boss({ mode: "council" }) });
    expect(html).toContain("действия админов решают админы голосованием");
  });

  it("голосование названо в заголовке — до того, как нажали, а не после", () => {
    const html = roomSheetHtml({
      room: { ...ROOM, can: [{ deed: "room:public", label: "Предложить: видимость", vote: true }] },
    });
    expect(html).toContain("ВИДИМОСТЬ · ГОЛОСОВАНИЕМ");
  });

  it("вечность, снятая с отсрочкой, стоит выключенной и говорит, когда это кончится", () => {
    const now = 1_000_000;
    const html = roomSheetHtml({ room: boss({ foreverDropAt: now + 24 * 60 * 60 * 1000 }), now });
    expect(html).toContain("Перестанет быть вечной завтра");
    expect(html).toContain("Вернуть");
    // ...и строка под кодом больше не зовёт её вечной: она уже не вечная.
    expect(html).toContain("живёт, пока в ней есть люди");
  });

  it("мест за столом не показывается вовсе, пока стол про мебель не сказал", () => {
    expect(roomSheetHtml({ room: boss() })).not.toContain("МЕСТ ЗА СТОЛОМ");
    const html = roomSheetHtml({ room: boss(), table: { chairs: 4, mayAddChair: true } });
    expect(html).toContain("МЕСТ ЗА СТОЛОМ");
    expect(html).toContain(`data-g="chairs"`);
  });

  it("ползунка нет у того, кому нельзя, а причина стоит вместо подсказки", () => {
    const html = roomSheetHtml({
      room: watcher(),
      table: { chairs: 4, mayAddChair: false, whyNoChair: "мебель двигает тот, кто распоряжается" },
    });
    expect(html).not.toContain(`data-g="chairs"`);
    expect(html).toContain("мебель двигает тот, кто распоряжается");
  });

  it("квадрат для камеры появляется только когда его попросили, и только если есть адрес", () => {
    expect(roomSheetHtml({ room: boss(), link: "https://x/y" })).not.toContain("<svg");
    expect(roomSheetHtml({ room: boss(), showQr: true })).not.toContain("<svg");
    expect(roomSheetHtml({ room: boss(), showQr: true, link: "https://x/y" })).toContain("<svg");
  });
});
