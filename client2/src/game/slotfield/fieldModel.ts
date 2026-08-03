import type { Board } from "./slotField";
import type { FieldPreset } from "./fieldPresets";
import type { AcceptRule } from "./fieldZone";

// Обернуть value-правило пресета (по ЛИЦАМ) в AcceptRule (по ids/слотам) через карту faces.
// Правило видит лицо груза и лицо верхней карты целевого слота + ключ слота (key-aware).
export function wrapRule(presetRule: FieldPreset["rule"], faces: Record<string, string>): AcceptRule | undefined {
  if (!presetRule) return undefined;
  return (ctx) => {
    const c = ctx.board.slots[ctx.toKey];
    const topId = c && c.members[c.members.length - 1];
    return presetRule(faces[ctx.figureId] ?? "", topId ? (faces[topId] ?? null) : null, ctx.toKey);
  };
}
