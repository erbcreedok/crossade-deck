import { Texture } from "pixi.js";
import type { CardTextureCache } from "../game/ui/CardTextureCache";

// ЗАГЛУШКА КЭША ТЕКСТУР — единственное, чего элементу стола не хватает в node.
//
// Фейка Pixi здесь НЕТ и не нужно: контейнеры, спрайты и графика v8 — обычный JS и в node живут
// как есть. Рендерер требуется ровно для одного — ИСПЕЧЬ текстуру (лицо карты, рубашку, пыль):
// это настоящий проход по GPU. Всё остальное поведение элемента — позы, высота, тень, дыхание,
// горение — считается на CPU и проверяется юнитом.
//
// Поэтому вместо подставной реализации всего Pixi (как `pixiFake` в первом клиенте, 272 строки на
// контейнеры, тикер и спрайты) достаточно подсунуть готовые текстуры. Меньше подделки — меньше
// шансов, что тест зелен на том, чего в настоящем движке нет.

export function texStub(): CardTextureCache {
  const t = () => Texture.WHITE;
  return {
    face: t,
    back: t,
    shadow: t,
    hiddenFace: t,
    hiddenBg: t,
    custom: t,
    dust: () => [],
    faceDustPoints: () => [],
  } as unknown as CardTextureCache;
}
