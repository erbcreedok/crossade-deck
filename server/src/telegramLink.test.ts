// СТОРОЖ `telegram-link.a-code-works-once-and-not-for-long`.
//
// Код ожидания — предъявительский: кто принёс его боту, тот и объявил себя владельцем аккаунта.
// Поэтому он одноразовый, пятиминутный и не выдаётся пачками.

import { beforeEach, describe, expect, it } from "vitest";
import {
  forgetLinks,
  issueLinkCode,
  linkByCode,
  LINK_CODE_EVERY_MS,
  LINK_CODE_TRIES,
  LINK_CODE_TTL_MS,
  missedLink,
  settleLink,
  takeSettled,
  tooSoon,
} from "./telegramLink.js";

const NOW = 1_800_000_000_000;

beforeEach(() => forgetLinks());

describe("telegram-link.a-code-works-once-and-not-for-long", () => {
  it("код живёт пять минут и ни секундой дольше", () => {
    const one = issueLinkCode("acc-1", NOW);

    expect(linkByCode(one.code, NOW + LINK_CODE_TTL_MS - 1)?.accountId).toBe("acc-1");
    expect(linkByCode(one.code, NOW + LINK_CODE_TTL_MS)).toBeUndefined();
  });

  it("срабатывает один раз: второй «Запустить» по той же ссылке ничего не привязывает", () => {
    const one = issueLinkCode("acc-1", NOW);

    expect(settleLink(one.code, "tg-1", "linked", NOW)?.state).toBe("linked");
    expect(settleLink(one.code, "tg-999", "linked", NOW)).toBeUndefined();
  });

  it("исход забирают вместе с кодом — дальше его нет", () => {
    const one = issueLinkCode("acc-1", NOW);
    settleLink(one.code, "tg-1", "linked", NOW);

    expect(takeSettled(one.code, NOW)?.state).toBe("linked");
    expect(linkByCode(one.code, NOW)).toBeUndefined();
  });

  it("пока бот молчит, ожидание остаётся ожиданием и код не сгорает", () => {
    const one = issueLinkCode("acc-1", NOW);

    expect(takeSettled(one.code, NOW)?.state).toBe("waiting");
    expect(linkByCode(one.code, NOW)).toBeDefined();
  });

  it("новый код отменяет прежний — у аккаунта их не бывает двух", () => {
    const first = issueLinkCode("acc-1", NOW);
    const second = issueLinkCode("acc-1", NOW + LINK_CODE_EVERY_MS);

    expect(linkByCode(first.code, NOW + LINK_CODE_EVERY_MS)).toBeUndefined();
    expect(linkByCode(second.code, NOW + LINK_CODE_EVERY_MS)).toBeDefined();
  });

  it("чаще раза в полминуты код не выдаётся", () => {
    issueLinkCode("acc-1", NOW);

    expect(tooSoon("acc-1", NOW + LINK_CODE_EVERY_MS - 1)).toBe(true);
    expect(tooSoon("acc-1", NOW + LINK_CODE_EVERY_MS)).toBe(false);
    // ...и это правило про ОДИН аккаунт, а не про сервер целиком.
    expect(tooSoon("acc-2", NOW)).toBe(false);
  });

  it("пять промахов — и кода больше нет", () => {
    const one = issueLinkCode("acc-1", NOW);

    for (let i = 0; i < LINK_CODE_TRIES - 1; i++) missedLink(one.code, NOW);
    expect(linkByCode(one.code, NOW)).toBeDefined();

    missedLink(one.code, NOW);
    expect(linkByCode(one.code, NOW)).toBeUndefined();
  });

  it("несуществующий код ничем не отзывается", () => {
    expect(linkByCode("не-выдавали", NOW)).toBeUndefined();
    expect(settleLink("не-выдавали", "tg-1", "linked", NOW)).toBeUndefined();
    expect(() => missedLink("не-выдавали", NOW)).not.toThrow();
  });

  it("коды не повторяются", () => {
    const codes = new Set(Array.from({ length: 200 }, (_, i) => issueLinkCode(`acc-${i}`, NOW).code));
    expect(codes.size).toBe(200);
  });
});
