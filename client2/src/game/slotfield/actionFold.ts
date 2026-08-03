// Свёртка Action над группой (GRID-DESIGN.md, раздел Actions). Решает, КАК действие (burn/flip/…)
// раскладывается по членам контейнера, исходя из их способности его выполнять. Чистая функция.
//
// Способность (`Burnable`/`Flippable`) — опциональна на АТОМЕ; здесь только логика свёртки, без Pixi.

export interface FoldResult {
  apply: string[]; // id членов, к кому применить действие
  container: boolean; // выполняет САМ контейнер (один эффект на всё; членам способность не нужна)
  blocked: boolean; // действие запрещено (no-op → груз домой)
}

/** Пресет ИЛИ своя reduce-функция (escape-hatch). */
export type Fold = "all" | "each" | "container" | "block" | ((members: string[], can: (id: string) => boolean) => FoldResult);

export function foldAction(members: string[], can: (id: string) => boolean, fold: Fold): FoldResult {
  if (typeof fold === "function") return fold(members, can);
  switch (fold) {
    case "all": {
      const everyone = members.every(can);
      return { apply: everyone ? [...members] : [], container: false, blocked: !everyone };
    }
    case "each":
      return { apply: members.filter(can), container: false, blocked: false };
    case "container":
      return { apply: [], container: true, blocked: false };
    case "block":
      return { apply: [], container: false, blocked: true };
  }
}
