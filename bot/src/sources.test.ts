// СТОРОЖ `bot.a-link-says-which-app-it-came-from`.
//
// У бота несколько приложений, а `/start` — единственное место, где он узнаёт, кому адресовано
// сообщение: в токене этого нет, там сказано лишь, кто бот. Значит имя приложения едет в самой
// ссылке, и ошибиться в его разборе — значит отнести подтверждение ЧУЖОМУ серверу: тот ответит «не
// знаю такого кода», а человек прочитает «ссылка устарела» про совершенно рабочую ссылку.

import { describe, expect, it } from "vitest";
import { readStart, sourceFor, sourcesOf, type Source } from "./sources.js";

const CODE = "9f2c1ab4d7e05386bb10cc42";

describe("bot.a-link-says-which-app-it-came-from", () => {
  it("имя приложения и код разбираются по первому подчёркиванию", () => {
    expect(readStart(`deck_${CODE}`)).toEqual({ source: "deck", code: CODE });
  });

  it("имя приводится к нижнему регистру — ссылку могли собрать как угодно", () => {
    expect(readStart(`DECK_${CODE}`)?.source).toBe("deck");
  });

  it("ссылка без имени — приложение, которое о втором ещё не знает", () => {
    expect(readStart(CODE)).toEqual({ code: CODE });
  });

  it("обычный /start кодом не считается", () => {
    expect(readStart(undefined)).toBeUndefined();
    expect(readStart("")).toBeUndefined();
    expect(readStart("   ")).toBeUndefined();
  });

  it("чужой формат — не наш код", () => {
    expect(readStart("deck_короткий")).toBeUndefined();
    expect(readStart("deck_")).toBeUndefined();
    expect(readStart(`_${CODE}`)).toBeUndefined();
    expect(readStart(`deck name_${CODE}`)).toBeUndefined();
    // Код — hex: base64url с его `_` и `-` внутри развалил бы разделитель.
    expect(readStart(`deck_nS9_aQ-2bC4dE6fG`)).toBeUndefined();
  });
});

describe("реестр приложений", () => {
  const env = {
    SOURCE_DECK_URL: "https://deck.example",
    SOURCE_DECK_SECRET: "deck-secret",
    SOURCE_SHOP_URL: "https://shop.example",
    SOURCE_SHOP_SECRET: "shop-secret",
  } as NodeJS.ProcessEnv;

  it("читается парами из окружения", () => {
    const found = sourcesOf(env);
    expect([...found.keys()].sort()).toEqual(["deck", "shop"]);
    expect(found.get("deck")).toEqual({ name: "deck", serverUrl: "https://deck.example", secret: "deck-secret" });
  });

  it("приложение без секрета в реестр не попадает — подтверждать ему нечем", () => {
    const found = sourcesOf({ SOURCE_HALF_URL: "https://half.example" } as NodeJS.ProcessEnv);
    expect(found.size).toBe(0);
  });

  it("подтверждение уходит тому, чьё имя несёт ссылка, и его секретом", () => {
    const found = sourcesOf(env);
    const to = sourceFor({ source: "shop", code: CODE }, found, { serverUrl: "https://deck.example", secret: "x" });
    expect(to?.serverUrl).toBe("https://shop.example");
    expect(to?.secret).toBe("shop-secret");
  });

  it("незнакомое имя не падает на умолчание — иначе чужой сервер, 404 и «ссылка устарела»", () => {
    const to = sourceFor({ source: "чужое", code: CODE }, sourcesOf(env), {
      serverUrl: "https://deck.example",
      secret: "x",
    });
    expect(to).toBeUndefined();
  });

  it("ссылка без имени идёт приложению по умолчанию — как было до второго", () => {
    const to = sourceFor({ code: CODE }, new Map<string, Source>(), {
      serverUrl: "https://deck.example",
      secret: "старый-секрет",
    });
    expect(to).toEqual({ name: "default", serverUrl: "https://deck.example", secret: "старый-секрет" });
  });

  it("умолчания без секрета не бывает: молча ходить с чужим секретом — это 401 и ложь человеку", () => {
    expect(sourceFor({ code: CODE }, new Map<string, Source>(), { serverUrl: "https://deck.example" })).toBeUndefined();
  });
});
