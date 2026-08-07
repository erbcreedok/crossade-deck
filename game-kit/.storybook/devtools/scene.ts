// The shared shell for a catalog scene: a toolbar of THIS canvas's own settings, the view
// under it, and nothing drawn on top of either.
//
// The tree used to sit beside the stage in the same box. On a phone that left a strip of
// table and a column of text — so the scene now only REPORTS what it holds, and the catalog
// draws it where there is room: the panel next to Controls in story mode, a block under the
// canvas on a docs page.
//
// The hud etalon, by contrast, came the other way: it used to live in the catalog's toolbar,
// which cannot be right on a page holding several canvases. It is a setting OF a canvas, so
// it stands on the canvas it belongs to.
//
// Viewer settings arrive as ONE object from the catalog and cascade through the host into the
// resolve context. A scene wires them once here, not toggle by toggle — otherwise the sixth
// switch would be wired in a sixth different way. The words ride ALONGSIDE that object, not
// inside it: the kit knows no language, so the captions stop here, in the catalog's own shell.

import { inspect, installTheme, mount, s, t, type Host, type Node, type ViewerSettings } from "../../src/index.js";
import { currentSettings, onSettingsChange, type CatalogSettings } from "./catalogSettings.js";
import { hudUnitPatch, type HudUnitChoice } from "./hudUnitChoices.js";
import { clearInspect, publishInspect, takeSceneId } from "./inspectorBus.js";
import { sceneToolbar } from "./sceneToolbar.js";

export interface Scene {
  readonly el: HTMLElement;
  readonly host: Host;
  /** Who this scene publishes as — the catalog matches a tree block to it by this. */
  readonly id: string;
  /** Re-apply theme, language and the rest without rebuilding the scene. */
  setSettings(next: CatalogSettings): void;
  /** Stop following the catalog and tear the view down. */
  dispose(): void;
}

export function scene(root: Node, settings: CatalogSettings = currentSettings()): Scene {
  installTheme(document, settings.viewer.theme);
  const id = takeSceneId();

  const el = document.createElement("div");
  el.style.cssText = [
    "display:grid",
    "grid-template-rows:auto 1fr",
    "height:100%",
    "min-height:320px",
    `background:${t("stageBg")}`,
    `color:${t("text")}`,
  ].join(";");

  const stage = document.createElement("div");
  stage.style.cssText = [
    "position:relative",
    "overflow:hidden",
    `background-image:radial-gradient(${t("grid")} 1px,transparent 1px)`,
    "background-size:22px 22px",
  ].join(";");

  // The etalon is this canvas's own, so the choice lives here rather than in any global: two
  // scenes on one page hold two different values and neither speaks for the other.
  let hudChoice: HudUnitChoice = "auto";
  let fromCatalog = settings;

  const bar = sceneToolbar(
    document,
    () => ({ text: fromCatalog.text, hudUnit: hudChoice }),
    (choice) => {
      hudChoice = choice;
      pushViewer();
    },
  );
  el.appendChild(bar.el);
  el.appendChild(stage);

  const host = mount(stage, root, withHudUnit(settings.viewer, hudChoice));

  function pushViewer(): void {
    host.setViewer(withHudUnit(fromCatalog.viewer, hudChoice));
  }

  const note = document.createElement("div");
  note.style.cssText = [
    "position:absolute",
    "left:16px",
    "bottom:14px",
    `font-family:${s("font.mono")}`,
    `font-size:${s("font.size.m")}`,
    `line-height:${s("font.line.normal")}`,
    `color:${t("textFaint")}`,
    "max-width:44ch",
    "pointer-events:none",
  ].join(";");
  stage.appendChild(note);

  const refresh = (): void => {
    const v = host.viewport();
    const text = fromCatalog.text;
    note.textContent =
      `${text.text("scene.viewport", { w: v.width, h: v.height, unit: host.unit() })} — ` +
      text.text("scene.nothingDrawn");
    bar.refresh();
    publishInspect({ sceneId: id, nodes: inspect(root) });
  };
  refresh();
  host.onChange(refresh);

  // A catalog change reaches a MOUNTED scene without rebuilding it — and never overrides the
  // etalon this canvas was set to by hand.
  const applySettings = (next: CatalogSettings): void => {
    fromCatalog = next;
    installTheme(document, next.viewer.theme);
    pushViewer(); // notifies listeners, so the note, the bar and the tree re-read it
  };
  const stopFollowing = onSettingsChange(applySettings);

  return {
    el,
    host,
    id,
    setSettings: applySettings,
    dispose() {
      stopFollowing();
      clearInspect(id);
      host.unmount();
    },
  };
}

/** `auto` must REMOVE the override, not set it to a number that only looks like absence. */
function withHudUnit(base: ViewerSettings, choice: HudUnitChoice): ViewerSettings {
  const { hudUnit: _ignored, ...rest } = base;
  return { ...rest, ...hudUnitPatch(choice) };
}
