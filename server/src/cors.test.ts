// СТОРОЖ `cors.every-verb-the-app-answers-is-allowed`.
//
// Браузер режет запрос ДО отправки, если метода нет в `Access-Control-Allow-Methods`. Маршрут при
// этом жив и в тестах зелен — а со страницы недостижим, и выглядит это как «сервер не отвечает».
// Ровно так `DELETE` на отвязке телеграма провисел до первого живого нажатия.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { ALLOWED_HEADERS, ALLOWED_METHODS, createApp } from "./app.js";

/** Все глаголы, под которые приложение зарегистрировало хоть один маршрут. */
function registeredVerbs(app: ReturnType<typeof createApp>["app"]): string[] {
  const stack = (app as unknown as { _router?: { stack: unknown[] }; router?: { stack: unknown[] } });
  const layers = (stack._router ?? stack.router)?.stack ?? [];
  const verbs = new Set<string>();
  for (const layer of layers as { route?: { methods: Record<string, boolean> } }[]) {
    for (const [verb, on] of Object.entries(layer.route?.methods ?? {})) if (on) verbs.add(verb.toUpperCase());
  }
  return [...verbs].sort();
}

describe("cors.every-verb-the-app-answers-is-allowed", () => {
  it("в списке для браузера есть каждый глагол, которым отвечает приложение", () => {
    const { app } = createApp();
    const missing = registeredVerbs(app).filter((verb) => !(ALLOWED_METHODS as readonly string[]).includes(verb));
    expect(missing).toEqual([]);
  });

  it("сторож смотрит на настоящие маршруты, а не на пустой список", () => {
    const verbs = registeredVerbs(createApp().app);
    expect(verbs).toContain("DELETE");
    expect(verbs.length).toBeGreaterThan(3);
  });
});

describe("cors.every-header-the-pages-send-is-allowed", () => {
  it("каждый свой заголовок, который шлют страницы стола, есть в списке для браузера", () => {
    const dir = join(__dirname, "..", "table-client");
    const sent = new Set<string>();
    for (const file of readdirSync(dir).filter((f) => /\.(ts|html)$/.test(f) && !f.endsWith(".test.ts"))) {
      for (const m of readFileSync(join(dir, file), "utf8").matchAll(/["'](x-[a-z-]+)["']\s*:/g)) sent.add(m[1]!);
    }
    expect(sent.size, "сторож видит настоящие заголовки").toBeGreaterThan(0);
    const allowed = ALLOWED_HEADERS.map((h) => h.toLowerCase());
    expect([...sent].filter((h) => !allowed.includes(h))).toEqual([]);
  });
});
