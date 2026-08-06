// ВАЛИДАЦИЯ HUD — громкость вместо тишины: битая спека не должна «тихо уезжать на борд»
// (так рука молча пропадала из HUD при коллизии ключей старого формата). Чистые проверки,
// сцена в dev логирует/кидает; продовые спеки сторожатся юнитами через эту же функцию.

import type { BoardSpec } from "../core/spec";
import { pinOf } from "../core/hudSpec";

/** Список претензий к hud спеки (пусто — всё честно). */
export function validateHud(spec: Pick<BoardSpec, "zones" | "hud">): string[] {
  const hud = spec.hud;
  if (!hud) return [];
  const out: string[] = [];
  const zoneIds = new Set(spec.zones.map((z) => z.id));
  const seen = new Map<string, number>();
  hud.areas.forEach((area, i) => {
    if (!area.widgets.length) out.push(`hud.areas[${i}]: область без виджетов`);
    for (const w of area.widgets) {
      if (w.kind === "zone") {
        if (!zoneIds.has(w.zone)) out.push(`hud.areas[${i}]: зона «${w.zone}» отсутствует в спеке`);
        const prev = seen.get(w.zone);
        if (prev !== undefined) out.push(`hud.areas[${i}]: зона «${w.zone}» уже пришвартована в areas[${prev}]`);
        else seen.set(w.zone, i);
      }
      if (pinOf(area) && typeof w.size === "object") out.push(`hud.areas[${i}]: {fr} в пине не работает — у пина нет лейна, задай px`);
    }
  });
  return out;
}
