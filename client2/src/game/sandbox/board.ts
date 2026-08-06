import type { BoardSpec } from "../boards/core/spec";
import { DEFAULT_SANDBOX_SETTINGS, type SandboxSettings } from "./settings";
import { roundTableBoard } from "../boards/library/roundTable";

// ПЕСОЧНИЦА — круглый стол по НАСТРОЙКАМ (по дефолту владельца: всё круг и динамично, одиночный
// режим). Спека целиком собирается билдером roundTableBoard из SandboxSettings — ровно те же
// данные крутит контекстное меню (long-press по гриду/борде, ПКМ). Шаг 1 (серый бокс + колода)
// зашит внутри: борда-бокс — free-зона, колода 36 в центре, стол пуст.
//
// Круг стола — пресет `capped` (кадр владельца 2026-08-05): сразу просторный и с потолком, чтобы
// стол не раздувался от каждой карты. Пресет — рычаг билдера, так что в меню он попадёт настройкой,
// а не переписыванием песочницы.
export function sandboxBoard(settings: SandboxSettings = DEFAULT_SANDBOX_SETTINGS): BoardSpec {
  // Рука песочницы («hand» — обычная strip-зона из roundTableBoard) — в ЭКРАННОМ HUD: док у
  // низа, фикс к камере, во всю ширину (scene/zoneDock.ts).
  const base = roundTableBoard({ ...settings, dealt: 0, ring: "capped" });
  return { ...base, id: "sandbox", hud: { bottom: { widgets: [{ kind: "zone", zone: "hand" }] } } };
}
