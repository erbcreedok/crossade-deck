// Глобальный конфиг КОНТЕЙНЕРА (живёт в нём, действует на все его фигуры). Данные, не код —
// тоглеры песочницы просто меняют поля. Поведенческие исходы (onOccupied/onDrop) — Action'ы,
// добавятся отдельно; здесь — структура/предпочтения контейнера.

export type GrabMode = "top" | "any" | "run" | "whole";
export type SelectSort = "selection" | "rank"; // порядок выноса выделения (дефолт — по номиналу)

export interface ContainerConfig {
  back: string; // рубашка карт (CardBackId)
  multiSelect: boolean; // режим мультиселекта доступен
  selectSort: SelectSort; // как сортируется вынесенный набор
  bounded: boolean; // фигуры заперты в рамке контейнера (не выбраться)
  grab: GrabMode[]; // какие захваты разрешены
  onEmpty: "collapse" | "keep"; // опустевший слот
}

export const DEFAULT_CONFIG: ContainerConfig = {
  back: "ruby",
  multiSelect: true,
  selectSort: "rank",
  bounded: true,
  grab: ["top", "whole"],
  onEmpty: "keep",
};

/** Слить частичный конфиг поверх дефолта. */
export function resolveConfig(partial: Partial<ContainerConfig>): ContainerConfig {
  return { ...DEFAULT_CONFIG, ...partial };
}
