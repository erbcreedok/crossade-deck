// ЛЕНТЫ-ПРЕСЕТЫ библиотеки: рука — ОБЫЧНАЯ strip-зона (никакого спецпонятия в словаре спеки).
// id «hand» — цель deal по умолчанию; приватность (hidden/locked) и живость (preview) — дефолты
// самой ленты (strip/config). Пресет — сахар данных: любая борда может объявить вторую ленту
// (мешок фишек, личную дропзону) тем же литералом с другим id.

import type { ZoneSpec } from "../core/spec";

export function handZone(over: Partial<ZoneSpec> = {}): ZoneSpec {
  return { id: "hand", title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" }, ...over };
}
