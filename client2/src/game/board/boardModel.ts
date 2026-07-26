import type { Board } from "./board";
import type { BoardPreset } from "./boardPresets";
import type { AcceptRule } from "./boardZone";

// Пресет-данные → логическая модель борда: уникальные id фигур по слотам (idPrefix-N) + карта
// id→лицо (для рендера/правил/сорта). Чистая — вынесена из движка (шаг к BoardFactory).
export function buildBoardModel(preset: BoardPreset, idPrefix: string): { slots: Board["slots"]; faces: Record<string, string> } {
  const slots: Board["slots"] = {};
  const faces: Record<string, string> = {};
  let n = 0;
  for (const [key, arr] of Object.entries(preset.slots)) {
    const ids = arr.map((face) => {
      const id = `${idPrefix}-${n++}`;
      faces[id] = face;
      return id;
    });
    slots[key] = { members: ids, maxSize: preset.maxSize };
  }
  return { slots, faces };
}

// Обернуть value-правило пресета (по ЛИЦАМ) в AcceptRule (по ids/слотам) через карту faces.
// Правило видит лицо груза и лицо верхней карты целевого слота + ключ слота (key-aware).
export function wrapRule(presetRule: BoardPreset["rule"], faces: Record<string, string>): AcceptRule | undefined {
  if (!presetRule) return undefined;
  return (ctx) => {
    const c = ctx.board.slots[ctx.toKey];
    const topId = c && c.members[c.members.length - 1];
    return presetRule(faces[ctx.figureId] ?? "", topId ? (faces[topId] ?? null) : null, ctx.toKey);
  };
}
