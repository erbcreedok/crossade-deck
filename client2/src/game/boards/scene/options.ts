// ОПЦИИ СЦЕНЫ БОРДЫ — контракт хоста (DIP): всё, чем хост (песочница, стори, live) настраивает
// generic-BoardScene. Только типы — сцена и хосты зависят от ЭТОГО файла, не друг от друга.

import type { MenuRow } from "../../ui/ContextMenu";
import type { BoardDriver } from "../core/driver";
import type { PresenceHub } from "../core/presence";
import type { BoardCommand, BoardSpec } from "../core/spec";
import type { MenuTargetKind } from "../geometry/sceneAreas";

/** Шов меню к хосту: сцена спрашивает строки, хост решает, что настраивается и как. */
export interface SceneMenus {
  /** Меню борды/стола. null — у хоста нет меню для этой цели. */
  menuFor(target: MenuTargetKind): { title: string; rows: readonly MenuRow[] } | null;
  /** Дорастить меню КОЛОДЫ строками хоста (напр. «колода · 36»). */
  deckExtras?(): readonly MenuRow[];
}

/** Канвас-кнопка хоста (правый верхний угол). */
export interface SceneTool {
  key: string;
  label: string;
  onClick: () => void;
}

/** Live-присутствие сцены: лок «кто первый схватил», чужие курсоры/драги и цвета. */
export interface ScenePresenceOptions {
  hub: PresenceHub;
  who: string;
  palette: (who: string) => number;
  label?: (who: string) => string;
}

/** SAFE-ZONE приложения: отступы от ФИЗИЧЕСКИХ краёв канваса, которые нельзя занимать (чёлки,
 *  индикаторы, скруглния — у каждого устройства свои). Движок платформу не знает: хост читает
 *  env(safe-area-inset-*) / API платформы и кормит сцену конфигом (и рычагом setSafeArea на
 *  повороты). HUD-доки и вписывание стола отступают на эти поля. */
export interface SafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const NO_SAFE_AREA: SafeArea = { top: 0, bottom: 0, left: 0, right: 0 };

export interface BoardSceneOptions {
  spec: BoardSpec;
  /** Safe-zone на старте (дефолт — нули: десктоп/стори). Живое обновление — scene.setSafeArea. */
  safeArea?: SafeArea;
  /** Сколько мест открыть (для динамических бордов). */
  seats?: number;
  /** Чьими глазами смотрим (его рука снизу). */
  selfSeat?: string;
  /** Лог команд порта — в панель Actions стори. */
  onCommand?: (cmd: BoardCommand) => void;
  /** Рассадка от комнаты: имя на стуле или null. Без неё — фантомы «Игрок N» (standalone). */
  occupants?: readonly (string | null)[];
  /** false — «только смотреть»: наблюдатель без права «мешать» (room.ts#canTouch). */
  interactive?: boolean;
  /** Кто исполняет команды: без драйвера — локальный мок (standalone); live передаёт клиента
   *  общего мастера. Сцена разницы не видит. */
  driver?: BoardDriver;
  /** Контекстные меню настроек (long-press/ПКМ) — шов к хосту: сцена не знает, ЧТО настраивается.
   *  Меню колоды/карты у сцены свои, хост может дорастить колоду через deckExtras. */
  menus?: SceneMenus;
  /** Канвас-кнопки хоста в правом верхнем углу (HTML в игровом экране запрещён доктриной). */
  tools?: readonly SceneTool[];
  /** Live-присутствие (песочница, админов нет). Хаб общий на всех клиентов стола. */
  presence?: ScenePresenceOptions;
}
