// МЕНЮ ПЕСОЧНИЦЫ — реализация шва SceneMenus (boards/scene): строки настроек борды/стола и
// довесок меню колоды (размер 36/52). Настройки живут ЗДЕСЬ, generic-борда о них не знает;
// смена значения пересобирает спеку и зовёт scene.reconfigure (миграция без потери карт).

import type { SceneMenus } from "../boards/scene";
import { BoardScene } from "../boards/scene";
import type { MenuRow } from "../ui/ContextMenu";
import type { BoardSpec } from "../boards/spec";
import { applySetting, settingRows, type SandboxSettings } from "./settings";

export interface SandboxMenus extends SceneMenus {
  /** Настройки сменились СНАРУЖИ (live: правка другого игрока) — меню показывает свежие значения. */
  setSettings(s: SandboxSettings): void;
}

export interface SandboxMenusOptions {
  /** Кто применяет смену настроек. Без него — соло: scene.reconfigure(build). Live передаёт
   *  session.changeSettings — миграцию и раздачу комнате делает сессия. */
  onApply?: (s: SandboxSettings) => void;
  /** Спрятать строку «посадки» (live: места раздаёт комната, меню их не крутит). */
  lockSeats?: boolean;
}

export function sandboxMenus(
  initial: SandboxSettings,
  build: (s: SandboxSettings) => BoardSpec,
  scene: () => BoardScene | null,
  opts: SandboxMenusOptions = {},
): SandboxMenus {
  let settings = initial;
  const apply = (key: keyof SandboxSettings): void => {
    settings = applySetting(settings, key);
    if (opts.onApply) opts.onApply(settings);
    else scene()?.reconfigure(build(settings), settings.seats);
  };
  return {
    menuFor(target) {
      const rows: MenuRow[] = settingRows(target, settings)
        .filter((r) => !(opts.lockSeats && r.key === "seats"))
        .map((r) => ({
          key: r.key,
          label: r.label,
          value: r.value,
          onSelect: () => apply(r.key),
        }));
      return { title: target === "board" ? "борда" : "стол", rows };
    },
    deckExtras: () => [{ key: "deck", label: "колода", value: String(settings.deck), onSelect: () => apply("deck") }],
    setSettings(s) {
      settings = s;
    },
  };
}
