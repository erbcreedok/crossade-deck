// ПЕРВЫЙ ЭКРАН СТОЛА — В САМОЙ СТРАНИЦЕ, иначе он не первый.
//
// Скрипт стола едет с мака через туннель; на холодном телефоне и после перезапуска туннеля это секунды.
// Пока он едет, видно только то, что есть в HTML, — без креста это был чёрный фон, и стол казался
// зависшим. Крест в странице — ровно строка `loadingMarkup` из `look`: копия сверяется здесь, а не
// держится в согласии памятью. Правка креста в `look` роняет этот тест — вставить строку заново.

import { describe, expect, it } from "vitest";
import { loadingMarkup } from "../../look/src/loading.js";
// Текстом, а не через `fs`: у клиента стола нет типов Node, он живёт в браузере (`raw.d.ts`).
import PAGE from "./index.html?raw";
import MAIN from "./main.ts?raw";

describe("table.the-cross-is-in-the-page", () => {
  it("страница несёт крест — ровно тот, что рисует `look`", () => {
    expect(PAGE).toContain(loadingMarkup("Загружаю стол"));
  });

  it("он стоит до скрипта стола и ничего не грузит сам", () => {
    const at = PAGE.indexOf("crossade-loading"), script = PAGE.indexOf('src="app.js"');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(script);
    const block = PAGE.slice(at, script);
    expect(block.includes("url("), "без картинок").toBe(false);
    expect(block.includes("<img"), "без картинок").toBe(false);
  });

  it("скрипт подхватывает его, а не поднимает второй", () => {
    expect(MAIN).toContain('loadingCross(document.body, "Загружаю стол")');
  });
});

// ОТКРЫТИЕ СТОЛА НЕ ЖДЁТ ЧУЖИХ СЕРВЕРОВ. Блокирующий стиль или скрипт с чужого адреса держит страницу, пока
// тот не ответит: зависший на телефоне Google Fonts или telegram.org — это десятки секунд чёрного экрана
// при живом столе. Чужое грузится в фоне: шрифт — `media="print"` с переключением по загрузке, SDK
// Telegram — из встроенного скрипта, и стол ждёт его не дольше `TG_WAIT_MS` (`main.ts`).
describe("table.the-page-waits-for-no-stranger", () => {
  it("ни одного блокирующего стиля или скрипта с чужого адреса", () => {
    const tags = PAGE.match(/<(link|script)\b[^>]*>/gi) ?? [];
    const blocking = tags.filter((tag) => {
      const src = /(?:href|src)="(https?:[^"]+)"/i.exec(tag)?.[1];
      if (!src) return false;
      if (/^<link/i.test(tag)) return /rel="stylesheet"/i.test(tag) && !/media="print"/i.test(tag);
      return !/\b(async|defer)\b/i.test(tag) && !/type="module"/i.test(tag);
    });
    expect(blocking).toEqual([]);
  });
});

