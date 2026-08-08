// THE CANVAS'S OWN TOOLBAR — static, above the view, and belonging to ONE canvas.
//
// The hud etalon used to sit in the catalog's toolbar, next to zoom. That was wrong the
// moment a page could hold more than one canvas: a docs page renders every story of the
// component, and one switch up there claimed to speak for all of them. A canvas setting
// belongs to the canvas, where it can only mean the thing it is standing on.
//
// Static on purpose — no popup. The row is part of the scene, like the tree block below it,
// and the reader can see the current value without opening anything.

import { s, t } from "../../src/index.js";
import { type CatalogText } from "../locales/catalog.js";
import { HUD_UNIT_CHOICES, type HudUnitChoice } from "./hudUnitChoices.js";

export interface ToolbarState {
  readonly text: CatalogText;
  readonly hudUnit: HudUnitChoice;
  readonly bounds: boolean;
}

export interface ToolbarHandlers {
  onHudUnit(choice: HudUnitChoice): void;
  onBounds(on: boolean): void;
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
    "display:flex",
    "align-items:center",
    "justify-content:flex-end",
    `gap:${s("space.s")}`,
    `padding:${s("space.xs")} ${s("space.s")}`,
    `background:${t("panelBg")}`,
    `border-bottom:1px solid ${t("panelBorder")}`,
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
  const bounds = doc.createElement("button");
  bounds.setAttribute("data-debug-bounds", "");
  bounds.type = "button";
  el.appendChild(bounds);

  const paintBounds = (onNow: boolean): void => {
    bounds.style.cssText = [
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

  bounds.addEventListener("click", () => {
    const next = bounds.getAttribute("aria-pressed") !== "true";
    bounds.setAttribute("aria-pressed", String(next));
    paintBounds(next);
    on.onBounds(next);
  });

  const refresh = (): void => {
    const { text, hudUnit, bounds: boundsOn } = read();
    bounds.textContent = text.text("viewer.bounds");
    bounds.title = text.text("viewer.bounds.hint");
    bounds.setAttribute("aria-pressed", String(boundsOn));
    paintBounds(boundsOn);
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
