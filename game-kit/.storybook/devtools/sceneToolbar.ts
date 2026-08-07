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

export interface SceneToolbar {
  readonly el: HTMLElement;
  /** Re-read the captions after a language change. */
  refresh(): void;
}

export function sceneToolbar(
  doc: Document,
  read: () => { text: CatalogText; hudUnit: HudUnitChoice },
  onHudUnit: (choice: HudUnitChoice) => void,
): SceneToolbar {
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
  ].join(";");
  for (const choice of HUD_UNIT_CHOICES) {
    const option = doc.createElement("option");
    option.value = String(choice);
    select.appendChild(option);
  }
  select.addEventListener("change", () => {
    const raw = select.value;
    onHudUnit(raw === "auto" ? "auto" : (Number(raw) as HudUnitChoice));
  });
  el.appendChild(select);

  const refresh = (): void => {
    const { text, hudUnit } = read();
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
