// СТОРОЖ `cors.every-verb-the-app-answers-is-allowed`.
//
// Браузер режет запрос ДО отправки, если метода нет в `Access-Control-Allow-Methods`. Маршрут при
// этом жив и в тестах зелен — а со страницы недостижим, и выглядит это как «сервер не отвечает».
// Ровно так `DELETE` на отвязке телеграма провисел до первого живого нажатия.

import { describe, it, expect } from "vitest";
import { ALLOWED_METHODS, createApp } from "./app.js";

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
