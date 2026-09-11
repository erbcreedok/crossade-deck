// ИЗ ЧЕГО СОБРАН ЭКРАН ПРОФИЛЯ — плашки, строки, кружок. Разметка и ничего больше: ни запросов, ни
// состояния.
//
// Цвета только из `@crossade/look` — в хабе это закон с собственным сканом, и профиль не
// исключение.

import { PALETTE, tint } from "@crossade/look";
import type { HomeFill, HomeLook } from "./look.js";
import type { FaceKind } from "./whoami.js";

export const FONT = "Tiny5, monospace";

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function svg(body: string, size: number, color: string, width = 2): string {
  return (
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" ` +
    `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  );
}

export const ICON = {
  /** Безликий силуэт — тот, кто ещё не назвался. */
  person: '<circle cx="12" cy="8.5" r="3.4"/><path d="M5 20c1.2-3.6 4-5.2 7-5.2s5.8 1.6 7 5.2"/>',
} as const;

export function fillCss(fill: HomeFill, blur = 7): string {
  switch (fill) {
    case "none":
      return "";
    case "glass":
      return `background:${tint(PALETTE.black, 0.42)};backdrop-filter:blur(${blur}px);-webkit-backdrop-filter:blur(${blur}px);`;
    case "wood":
      return `background:linear-gradient(${PALETTE.panel},${PALETTE.well});`;
    case "dark":
      return `background:${PALETTE.well};`;
    case "fade":
      return `background:linear-gradient(${tint(PALETTE.black, 0.9)},${tint(PALETTE.black, 0)});`;
  }
}

/**
 * КРУЖОК ЧЕЛОВЕКА. Безликий силуэт стоит на тёмной плашке, а не на цветной: цвет — это то, что
 * человек ВЫБРАЛ, и выданный по умолчанию отнял бы у выбора смысл.
 */
export function ballHtml(face: FaceKind, ink: string | null, size: number, ring: number): string {
  const inner =
    face.kind === "picture"
      ? `<img src="${esc(face.src)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">`
      : face.kind === "emoji"
      ? `<span style="font-size:${Math.round(size * 0.56)}px;line-height:1">${esc(face.emoji)}</span>`
      : face.kind === "letter"
        ? `<span style="font:400 ${Math.round(size * 0.42)}px ${FONT};color:${PALETTE.black}">${esc(face.letter)}</span>`
        : svg(ICON.person, Math.round(size * 0.62), PALETTE.inkDim);
  const ground = face.kind === "emoji" || face.kind === "picture" || !ink ? PALETTE.well : ink;
  const halo = ring > 0 && ink ? `,0 0 0 ${ring}px ${ink}` : "";
  return (
    `<span style="flex:none;width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;` +
    `justify-content:center;overflow:hidden;background:${ground};box-shadow:inset 0 0 0 3px ${PALETTE.black}${halo}">${inner}</span>`
  );
}

/** Кнопка: золотая зовёт, обычная действует, тихая не настаивает. */
export function buttonHtml(id: string, text: string, kind: "gold" | "plain" | "quiet", radius: number): string {
  const skin =
    kind === "gold"
      ? `background:linear-gradient(${PALETTE.gold},${PALETTE.panelLight});box-shadow:inset 0 0 0 3px ${PALETTE.black},0 2px 0 ${tint(PALETTE.black, 0.6)};color:${PALETTE.black};`
      : kind === "quiet"
        ? `background:transparent;box-shadow:inset 0 0 0 2px ${PALETTE.panel};color:${PALETTE.inkDim};`
        : `background:linear-gradient(${PALETTE.felt},${PALETTE.feltDark});box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.panel},0 3px 0 ${tint(PALETTE.black, 0.55)};color:${PALETTE.ink};`;
  return (
    `<button data-do="${id}" style="flex:none;font:400 13px ${FONT};cursor:pointer;border:0;border-radius:${radius}px;` +
    `padding:8px 12px;${skin}">${esc(text)}</button>`
  );
}

/** Строка настройки: слева что это, справа что с этим делают. */
export function lineHtml(inner: string, ruled: boolean): string {
  return (
    `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 0;` +
    `${ruled ? `box-shadow:inset 0 3px 0 -1px ${tint(PALETTE.black, 0.55)};` : ""}">${inner}</div>`
  );
}

export const labelHtml = (text: string): string =>
  `<span style="font:400 14px ${FONT};color:${PALETTE.inkDim}">${esc(text)}</span>`;

export const valueHtml = (text: string): string =>
  `<span style="font:400 15px ${FONT};color:${PALETTE.ink};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(text)}</span>`;

/** Восемь любимых цветов, выбранный — в ободке. */
export function swatchesHtml(inks: readonly string[], chosen: string | null): string {
  return inks
    .map(
      (ink) =>
        `<button data-do="color:${ink}" aria-label="${ink}" style="width:30px;height:30px;border:0;border-radius:50%;cursor:pointer;` +
        `background:${ink};box-shadow:inset 0 0 0 3px ${PALETTE.black}${ink === chosen ? `,0 0 0 3px ${PALETTE.ink}` : ""}"></button>`,
    )
    .join("");
}

export function headBandCss(look: HomeLook, inset: string): string {
  return `padding-top:${inset};${fillCss(look.fill)}`;
}
