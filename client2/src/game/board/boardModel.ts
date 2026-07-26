import type { Board } from "./board";
import type { BoardPreset } from "./boardPresets";

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
