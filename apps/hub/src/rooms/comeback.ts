// РЯД «КУДА ЗАЙТИ» — две-три подсказки между именем места и полкой.
//
// Человек чаще ВОЗВРАЩАЕТСЯ, чем выбирает. Полка отвечает на вопрос «во что играть», а этот ряд —
// на «куда зайти», и у вернувшегося он первый. Дороги назад не было нигде, и всё остальное работало
// только для новичка, которым игрок бывает ровно один раз.
//
// РЯД ПРОПАДАЕТ ЦЕЛИКОМ, когда предлагать нечего: пустая полоса «пока ничего» занимает место и не
// говорит ничего.

import { PALETTE } from "@crossade/look";
import type { RoomCard } from "@crossade/wire";
import { bridgeGames } from "./door.js";

const FONT = "Tiny5, monospace";
const CODE_FONT = "'Press Start 2P', monospace";

const esc = (s: string): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Сколько карточек влезает в ряд, прежде чем он превращается в список. Остальные — в списке комнат. */
const MOST = 4;

export interface ComebackCard {
  readonly code: string;
  readonly game: string;
  readonly gameName: string;
  readonly sign: string;
  /** Одной строкой: почему стоит зайти именно сюда. */
  readonly said: string;
  /** Горячая — та, где ждут ХОДА: единственное, ради чего этот ряд читают. */
  readonly hot: boolean;
}

/**
 * ЧТО ПРЕДЛОЖИТЬ ВЕРНУВШЕМУСЯ. Свои столы, и сперва те, где ждут его хода: остальное — по свежести.
 */
export function comebackCards(rooms: readonly RoomCard[], now = Date.now()): ComebackCard[] {
  const games = bridgeGames();
  return rooms
    .filter((one) => one.mySeat && one.code)
    .sort((a, b) => Number(b.myTurn ?? false) - Number(a.myTurn ?? false))
    .slice(0, MOST)
    .map((one) => {
      const look = games.find((g) => g.id === one.game);
      return {
        code: one.code!,
        game: one.game,
        gameName: look?.name ?? one.game,
        sign: look?.sign ?? "♠",
        said: one.myTurn ? "твой ход" : one.online === 0 ? "все вышли · ждёт" : "твой стул",
        hot: one.myTurn === true,
      };
    });
}

export interface Comeback {
  readonly element: HTMLElement;
  /** Показать подсказки. Пустой список снимает ряд целиком. */
  set(cards: readonly ComebackCard[]): void;
  /** Где ряд стоит — под именем места, в пикселях от верха стекла. */
  place(topPx: number): void;
  stop(): void;
}

export function comebackRow(container: HTMLElement, onGo: (game: string, code: string) => void): Comeback {
  let cards: readonly ComebackCard[] = [];
  let top = 0;

  const element = document.createElement("div");
  element.className = "crossade-comeback";
  element.style.cssText = "position:absolute;left:0;right:0;z-index:8;pointer-events:none";
  container.appendChild(element);

  const cardHtml = (one: ComebackCard): string =>
    `<button data-do="go:${esc(one.game)}:${esc(one.code)}" style="flex:none;width:172px;text-align:left;cursor:pointer;border:0;` +
    `border-radius:12px;padding:10px 11px;pointer-events:auto;background:${PALETTE.well};` +
    `box-shadow:inset 0 0 0 3px ${PALETTE.black},inset 0 0 0 5px ${one.hot ? PALETTE.gold : PALETTE.wood};` +
    `display:flex;align-items:center;gap:10px">` +
    `<span style="flex:none;width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;` +
    `background:${PALETTE.black};font-size:17px">${esc(one.sign)}</span>` +
    `<span style="display:flex;flex-direction:column;gap:3px;min-width:0">` +
    `<span style="font:400 11px ${CODE_FONT};color:${PALETTE.gold}">${esc(one.code)}</span>` +
    `<span style="font:400 10px ${FONT};color:${one.hot ? PALETTE.gold : PALETTE.inkDim};white-space:nowrap;` +
    `overflow:hidden;text-overflow:ellipsis">${esc(one.gameName)} · ${esc(one.said)}</span>` +
    `</span></button>`;

  const draw = (): void => {
    element.style.top = `${top}px`;
    element.innerHTML =
      cards.length === 0
        ? ""
        : `<div style="display:flex;flex-direction:column;gap:7px">` +
          `<span style="font:400 10px ${FONT};letter-spacing:.1em;color:${PALETTE.inkDim};opacity:.75;padding:0 12px">КУДА ЗАЙТИ</span>` +
          // Ряд едет вбок, но полоса прокрутки поперёк сукна выглядит поломкой.
          `<div style="display:flex;gap:8px;overflow:auto;padding:0 12px 2px;scrollbar-width:none">${cards.map(cardHtml).join("")}</div></div>`;
  };

  element.addEventListener("click", (e) => {
    const hit = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-do]");
    const does = hit?.dataset["do"];
    if (!does?.startsWith("go:")) return;
    const [, game, code] = does.split(":");
    if (game && code) onGo(game, code);
  });

  draw();
  return {
    element,
    set(next) {
      cards = next;
      draw();
    },
    place(topPx) {
      top = topPx;
      element.style.top = `${topPx}px`;
    },
    stop() {
      element.remove();
    },
  };
}
