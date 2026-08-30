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
  /** Is the dashcam rolling, and how many moments have been stamped on this take. */
  readonly recording: boolean;
  readonly marks: number;
}

export interface ToolbarHandlers {
  onHudUnit(choice: HudUnitChoice): void;
  onBounds(on: boolean): void;
  onGrid(on: boolean): void;
  /** Start or stop the dashcam. */
  onRecord(on: boolean): void;
  /** "The thing I am telling you about is HERE" — the one entry a person writes. */
  onMark(): void;
  /** Hand the take over as a file. */
  onExport(): void;
}

export interface SceneToolbar {
  readonly el: HTMLElement;
  /** Re-read the captions after a language change. */
  refresh(): void;
}

/**
 * PRESS IT WITH ANY FINGER, INCLUDING THE SECOND ONE.
 *
 * A `click` listener is deaf to a second simultaneous touch, and that is the specification rather
 * than a quirk: the compatibility mouse events a touch synthesises — `click` among them — are fired
 * only for the PRIMARY pointer, and the primary pointer is the first finger still down. So on a
 * desk where one hand is resting on the pack, none of these buttons answered at all: the reader
 * could not stamp the moment they were looking at, which is the one thing the dashcam is for.
 *
 * So the press is read off the POINTER, which every finger has. The compatibility click is refused
 * outright for touch (`preventDefault` on the down), and the `click` path is kept for the keyboard
 * alone — where `detail` is zero, because no pointer produced it.
 */
function onTouch(button: HTMLButtonElement, run: () => void): void {
  let down = -1;
  button.addEventListener("pointerdown", (e: PointerEvent) => {
    down = e.pointerId;
    // No synthesised click behind the pointer one, or a first-finger press would fire twice.
    if (e.pointerType !== "mouse") e.preventDefault();
  });
  button.addEventListener("pointerup", (e: PointerEvent) => {
    if (e.pointerId !== down) return;
    down = -1;
    run();
  });
  button.addEventListener("pointercancel", () => {
    down = -1;
  });
  // A keyboard press has no pointer behind it, and that is exactly what `detail === 0` says.
  button.addEventListener("click", (e: MouseEvent) => {
    if (e.detail === 0) run();
  });
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
        `padding:${s("space.xs")} ${s("space.s")}`,
        "min-height:34px",
        "white-space:nowrap",
        "flex:none",
        "cursor:pointer",
      ].join(";");
    };

    onTouch(button, () => {
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

  /**
   * THE DASHCAM'S THREE, and they are three because they are three different acts: start the
   * recording, stamp THIS moment, hand the take over. Only the first is a state, so only the first
   * is a toggle; the other two are things a person does once.
   *
   * `mark` and `export` are dead while nothing is rolling rather than hidden — a control that comes
   * and goes teaches nobody what it is for, and a reader looking for how to report a jerk should be
   * able to see the answer before they need it.
   */
  const press = (attribute: string, onPress: () => void) => {
    const button = doc.createElement("button");
    button.setAttribute(attribute, "");
    button.type = "button";
    el.appendChild(button);
    const repaint = (live: boolean): void => {
      button.style.cssText = [
        `font-family:${s("font.mono")}`,
        `font-size:${s("font.size.s")}`,
        `color:${live ? t("debug") : t("textMuted")}`,
        `background:${t("sunkBg")}`,
        `border:1px solid ${live ? t("debug") : t("panelBorder")}`,
        `border-radius:${s("radius.s")}`,
        `padding:${s("space.xs")} ${s("space.s")}`,
        "min-height:34px",
        `cursor:${live ? "pointer" : "default"}`,
        `opacity:${live ? "1" : "0.45"}`,
      ].join(";");
    };
    onTouch(button, onPress);
    return {
      show(caption: string, hint: string, live: boolean) {
        button.textContent = caption;
        button.title = hint;
        // Dimmed rather than switched off, and it is not a shortcut: both of these are silent when
        // nothing is rolling anyway (`journal.ts` returns on its first line), so the button is
        // already inert and the paint is simply telling the truth about it. A control that comes
        // and goes teaches nobody what it is for, and somebody looking for how to report a jerk
        // should be able to see the answer before they need it.
        repaint(live);
      },
    };
  };

  const rec = toggle("data-debug-rec", (next) => on.onRecord(next));
  const stamp = press("data-debug-mark", () => on.onMark());
  const save = press("data-debug-export", () => on.onExport());

  const refresh = (): void => {
    const { text, hudUnit, bounds: boundsOn, grid: gridOn, recording, marks } = read();
    bounds.show(boundsOn, text.text("viewer.bounds"), text.text("viewer.bounds.hint"));
    grid.show(gridOn, text.text("viewer.grid"), text.text("viewer.grid.hint"));
    rec.show(recording, text.text("viewer.rec"), text.text("viewer.rec.hint"));
    // The mark's caption CARRIES THE COUNT, because the number is the thing a person then says out
    // loud — "look at mark three" — and a count you have to remember is a count nobody uses.
    stamp.show(marks > 0 ? text.text("viewer.mark.n", { n: marks }) : text.text("viewer.mark"), text.text("viewer.mark.hint"), recording);
    save.show(text.text("viewer.export"), text.text("viewer.export.hint"), recording);
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
