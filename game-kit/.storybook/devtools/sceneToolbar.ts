// THE CANVAS'S OWN TOOLBAR — a row in the corner of the view, belonging to ONE canvas.
//
// The hud etalon used to sit in the catalog's toolbar, next to zoom. That was wrong the
// moment a page could hold more than one canvas: a docs page renders every story of the
// component, and one switch up there claimed to speak for all of them. A canvas setting
// belongs to the canvas, where it can only mean the thing it is standing on.
//
// Static on purpose — no popup. The row is part of the scene, like the tree block below it,
// and the reader can see the current value without opening anything.
//
// It floats over the view rather than standing above it: a track would take its height out of
// the picture, and the origin of a scene is the centre of the VIEW. See `scene.ts` for the
// measurement that made that a bug rather than a preference.

import { s, t } from "../../src/index.js";
import { type CatalogText } from "../locales/catalog.js";
import { HUD_UNIT_CHOICES, type HudUnitChoice } from "./hudUnitChoices.js";

export interface ToolbarState {
  readonly text: CatalogText;
  readonly hudUnit: HudUnitChoice;
  readonly bounds: boolean;
  readonly grid: boolean;
}

export interface ToolbarHandlers {
  onHudUnit(choice: HudUnitChoice): void;
  onBounds(on: boolean): void;
  onGrid(on: boolean): void;
}

export interface SceneToolbar {
  readonly el: HTMLElement;
  /** Re-read the captions after a language change. */
  refresh(): void;
}

export function sceneToolbar(doc: Document, read: () => ToolbarState, on: ToolbarHandlers): SceneToolbar {
  const el = doc.createElement("div");
  el.setAttribute("data-scene-toolbar", "");
  el.style.cssText = [
    "position:absolute",
    `top:${s("space.s")}`,
    `right:${s("space.s")}`,
    // The left edge is bounded, not set: the row is as wide as its contents until it would
    // reach the opposite margin, and only then does it wrap. Pinned to both sides it would be
    // a track again, just one drawn over the picture.
    `max-width:calc(100% - 2 * ${s("space.s")})`,
    "display:flex",
    "flex-wrap:wrap",
    "align-items:center",
    "justify-content:flex-end",
    `gap:${s("space.s")}`,
    `padding:${s("space.xs")} ${s("space.s")}`,
    `background:${t("panelBg")}`,
    `border:1px solid ${t("panelBorder")}`,
    `border-radius:${s("radius.m")}`,
  ].join(";");

  const label = doc.createElement("span");
  // Longhands, not the `font` shorthand: a shorthand assembled from custom properties is not
  // reliably applied through the style object, and it fails SILENTLY — the row then inherits
  // the page's type and comes out twice the size of the controls beside it.
  label.style.cssText = [
    `font-family:${s("font.mono")}`,
    `font-size:${s("font.size.s")}`,
    `line-height:${s("font.line.normal")}`,
    `color:${t("textMuted")}`,
    "letter-spacing:.5px",
    // One line. Wrapped to two it doubles the height of the row for no information at all.
    "white-space:nowrap",
    "flex:none",
  ].join(";");
  el.appendChild(label);

  const select = doc.createElement("select");
  select.setAttribute("data-hud-unit", "");
  select.style.cssText = [
    `font-family:${s("font.mono")}`,
    `font-size:${s("font.size.s")}`,
    `color:${t("text")}`,
    `background:${t("sunkBg")}`,
    `border:1px solid ${t("panelBorder")}`,
    `border-radius:${s("radius.s")}`,
    `padding:2px ${s("space.xs")}`,
    // A select sizes itself to its WIDEST option, and the widest here is a sentence — on a
    // phone it took two thirds of the row and pushed the neighbouring toggle off the screen.
    // Capped, the closed control shows as much as fits and the rest is an ellipsis; the OPEN
    // list is drawn by the platform and still sizes to its content, so nothing is lost.
    "max-width:14ch",
    "min-width:0",
    "flex:0 1 auto",
    "overflow:hidden",
    "text-overflow:ellipsis",
  ].join(";");
  for (const choice of HUD_UNIT_CHOICES) {
    const option = doc.createElement("option");
    option.value = String(choice);
    select.appendChild(option);
  }
  select.addEventListener("change", () => {
    const raw = select.value;
    on.onHudUnit(raw === "auto" ? "auto" : (Number(raw) as HudUnitChoice));
  });
  el.appendChild(select);

  // A TOGGLE, not a second dropdown: it has two states and it is pressed far more often than
  // the etalon is chosen. `aria-pressed` carries the state, so the button says what it is
  // rather than relying on a colour a reader may not be able to tell apart.
  //
  // Written as a FACTORY once there were two of them. Copied instead, the second toggle came
  // out with its own idea of padding within a week — that is how a row of controls stops
  // reading as a row.
  const toggle = (attribute: string, onPress: (on: boolean) => void) => {
    const button = doc.createElement("button");
    button.setAttribute(attribute, "");
    button.type = "button";
    el.appendChild(button);

    const repaint = (onNow: boolean): void => {
      button.style.cssText = [
        `font-family:${s("font.mono")}`,
        `font-size:${s("font.size.s")}`,
        `color:${onNow ? t("debug") : t("textMuted")}`,
        `background:${t("sunkBg")}`,
        `border:1px solid ${onNow ? t("debug") : t("panelBorder")}`,
        `border-radius:${s("radius.s")}`,
        `padding:2px ${s("space.s")}`,
        "white-space:nowrap",
        "flex:none",
        "cursor:pointer",
      ].join(";");
    };

    button.addEventListener("click", () => {
      const next = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(next));
      repaint(next);
      onPress(next);
    });

    return {
      show(onNow: boolean, caption: string, hint: string): void {
        button.textContent = caption;
        button.title = hint;
        button.setAttribute("aria-pressed", String(onNow));
        repaint(onNow);
      },
    };
  };

  const bounds = toggle("data-debug-bounds", (next) => on.onBounds(next));
  const grid = toggle("data-debug-grid", (next) => on.onGrid(next));

  const refresh = (): void => {
    const { text, hudUnit, bounds: boundsOn, grid: gridOn } = read();
    bounds.show(boundsOn, text.text("viewer.bounds"), text.text("viewer.bounds.hint"));
    grid.show(gridOn, text.text("viewer.grid"), text.text("viewer.grid.hint"));
    label.textContent = text.text("viewer.hudUnit");
    select.title = text.text("viewer.hudUnit.hint");
    [...select.options].forEach((option, i) => {
      const choice = HUD_UNIT_CHOICES[i]!;
      option.textContent =
        choice === "auto" ? text.text("viewer.hudUnit.auto") : text.text("viewer.hudUnit.px", { n: choice });
    });
    select.value = String(hudUnit);
  };
  refresh();

  return { el, refresh };
}
