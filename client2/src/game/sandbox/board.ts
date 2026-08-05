import type { BoardSpec } from "../boards/core/spec";
import { DEFAULT_SANDBOX_SETTINGS, type SandboxSettings } from "./settings";
import { roundTableBoard } from "../boards/library/roundTable";

// ПЕСОЧНИЦА — круглый стол по НАСТРОЙКАМ (по дефолту владельца: всё круг и динамично, одиночный
// режим). Спека целиком собирается билдером roundTableBoard из SandboxSettings — ровно те же
// данные крутит контекстное меню (long-press по гриду/борде, ПКМ). Шаг 1 (серый бокс + колода)
// зашит внутри: борда-бокс — free-зона, колода 36 в центре, стол пуст.
export function sandboxBoard(settings: SandboxSettings = DEFAULT_SANDBOX_SETTINGS): BoardSpec {
  return { ...roundTableBoard({ ...settings, dealt: 0 }), id: "sandbox" };
}
