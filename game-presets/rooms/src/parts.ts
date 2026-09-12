// ИЗ ЧЕГО СОБРАН МОСТ — кнопки, селекторы, тумблер, ползунок мест и кружок человека.
//
// Одни и те же вопросы задаются в двух местах («сколько мест», «кто решает») — при создании стола и
// при поиске, — и задавать их надо ОДИНАКОВО: человек, научившийся тянуть ползунок в одном месте,
// ищет его же в другом.
//
// Разметка и ничего больше: ни запросов, ни состояния. Цвета только из `@crossade/look`.

import { FAVOURITE_INKS, PALETTE, tint } from "@crossade/look";

export const FONT = "Tiny5, monospace";
/** Код набирают глазами с чужого экрана — он пишется шрифтом, где знаки не сливаются. */
export const CODE_FONT = "'Press Start 2P', monospace";

export const esc = (s: string): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Кнопка: золотая зовёт, обычная действует, тихая не настаивает. */
export function btn(id: string, text: string, kind: "gold" | "plain" | "quiet" = "plain", small = false): string {
  const skin =
    kind === "gold"
      ? `background:linear-gradient(#f8d885 0%,${PALETTE.gold} 48%,#b08a26 100%);box-shadow:inset 0 0 0 3px ${PALETTE.black},0 2px 0 ${tint(PALETTE.black, 0.6)};color:${PALETTE.black};`
      : kind === "quiet"
        ? `background:transparent;box-shadow:inset 0 0 0 2px ${PALETTE.wood};color:${PALETTE.inkDim};`
        : `background:linear-gradient(#25321f,#16210f);box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.wood},0 3px 0 ${tint(PALETTE.black, 0.55)};color:${PALETTE.ink};`;
  return (
    `<button data-do="${esc(id)}" style="font:400 ${small ? 12 : 13}px ${FONT};cursor:pointer;border:0;border-radius:8px;` +
    `padding:${small ? "8px 10px" : "11px 14px"};${skin}">${esc(text)}</button>`
  );
}

export const label = (text: string): string =>
  `<span style="font:400 10px ${FONT};letter-spacing:.1em;color:${PALETTE.inkDim};opacity:.7">${esc(text)}</span>`;

export const block = (title: string, inner: string): string =>
  `<div style="display:flex;flex-direction:column;gap:9px;padding:14px 0;box-shadow:inset 0 3px 0 -1px ${tint(PALETTE.black, 0.55)}">${label(title)}${inner}</div>`;

export const hint = (text: string): string =>
  `<span style="font:400 11px ${FONT};color:${PALETTE.inkDim};line-height:1.6">${esc(text)}</span>`;

/** Селектор: варианты рядом, выбранный горит. Чтобы видеть ВСЕ ответы разом, а не по кругу. */
export function pick(id: string, options: readonly { id: string; text: string }[], now: string): string {
  return (
    `<div style="display:flex;gap:6px;flex-wrap:wrap">` +
    options
      .map((one) => {
        const on = one.id === now;
        return (
          `<button data-do="${esc(id)}:${esc(one.id)}" style="flex:1 1 auto;cursor:pointer;border:0;border-radius:8px;padding:9px 10px;` +
          `font:400 12px ${FONT};white-space:nowrap;` +
          (on
            ? `background:linear-gradient(#f8d885 0%,${PALETTE.gold} 48%,#b08a26 100%);box-shadow:inset 0 0 0 3px ${PALETTE.black},0 2px 0 ${tint(PALETTE.black, 0.6)};color:${PALETTE.black};`
            : `background:linear-gradient(#25321f,#16210f);box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.wood};color:${PALETTE.inkDim};`) +
          `">${esc(one.text)}</button>`
        );
      })
      .join("") +
    `</div>`
  );
}

/** Тумблер: два состояния и нет середины, подписан ПОСЛЕДСТВИЕМ, а не словом «да». */
export function toggle(id: string, on: boolean, yes: string, no: string): string {
  return (
    `<button data-do="${esc(id)}" style="cursor:pointer;border:0;background:transparent;display:flex;align-items:center;gap:10px;padding:0">` +
    `<span style="flex:none;width:52px;height:30px;border-radius:999px;display:flex;align-items:center;padding:0 3px;box-sizing:border-box;` +
    `background:${on ? PALETTE.gold : PALETTE.well};box-shadow:inset 0 0 0 3px ${PALETTE.black};justify-content:${on ? "flex-end" : "flex-start"}">` +
    `<span style="width:22px;height:22px;border-radius:50%;background:${on ? PALETTE.black : PALETTE.wood}"></span></span>` +
    `<span style="font:400 13px ${FONT};color:${on ? PALETTE.ink : PALETTE.inkDim};text-align:left">${esc(on ? yes : no)}</span></button>`
  );
}

/** Сколько мест бывает за столом. Двое — это уже стол; тридцать два — потолок, дальше не игра. */
export const SEATS_MIN = 2;
export const SEATS_MAX = 32;

/** ДВА ПУТИ К ОДНОМУ ЧИСЛУ: ползунок — когда «примерно столько», цифра — когда число известно. */
export function seatsControl(id: string, value: number, words: string): string {
  return (
    `<div style="display:flex;align-items:center;gap:12px">` +
    `<button data-do="${esc(id)}" style="flex:none;cursor:pointer;border:0;background:${PALETTE.well};` +
    `box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${PALETTE.wood};border-radius:10px;padding:11px 16px;` +
    `font:400 17px ${CODE_FONT};color:${PALETTE.ink}"><span data-g="${esc(id)}-value">${value}</span></button>` +
    `<input data-slider="${esc(id)}" type="range" min="${SEATS_MIN}" max="${SEATS_MAX}" step="1" value="${value}" ` +
    `style="flex:1;accent-color:${PALETTE.gold};height:30px"></div>` +
    hint(words)
  );
}

/**
 * КРУЖОК ЧЕЛОВЕКА В СТРОКЕ СТОЛА. Цвет — его собственный, выбранный в профиле; у кого его нет,
 * кружок тёмный: выданный по умолчанию цвет отнял бы у выбора смысл.
 */
export function ball(size: number, color: string | null, letter: string): string {
  return (
    `<span style="flex:none;width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;` +
    `justify-content:center;background:${color ?? PALETTE.well};box-shadow:inset 0 0 0 3px ${PALETTE.black}">` +
    `<span style="font:400 ${Math.round(size * 0.42)}px ${FONT};color:${color ? PALETTE.black : PALETTE.inkDim}">${esc(letter)}</span></span>`
  );
}

/** Цвет человека, у которого его нет: по имени, чтобы за столом он всё же отличался от соседа. */
export function inkFor(name: string): string {
  let sum = 0;
  for (const sign of name) sum = (sum + sign.codePointAt(0)!) % 997;
  return FAVOURITE_INKS[sum % FAVOURITE_INKS.length]!;
}
