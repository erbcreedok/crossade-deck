import { at as boardAt } from "../board/board";
import { topId } from "../board/container";
import { FOUNDATION_KEYS, TABLEAU_KEYS, foundationKeyOf, type SolitaireGameState } from "../board/solitaireState";
import { foundationAccepts, tableauAccepts } from "../board/solitaireRules";
import { absolute, pile } from "../slot/layouts";
import { dropTarget, homeOf as leafHomeOf, measure } from "../slot/slot";
import { group, leaf, type Caps, type Group, type Size, type Vec } from "../slot/types";

// ГЕОМЕТРИЯ КОСЫНКИ — одно дерево слотов (game/slot/) на ВСЁ сразу: где рисовать карту, где её дом
// и куда попадает дроп. Именно «одно», а не три: прошлый заход держал прямоугольники зон
// (slotGeometries) ОТДЕЛЬНО от рендера, и они разъезжались — карта лежала в одном месте, а зона,
// которая её принимает, была в другом (SOLITAIRE-REBUILD-HANDOFF §2). В дереве расхождению
// взяться неоткуда: дом карты и область дропа выводятся из ОДНИХ И ТЕХ ЖЕ раскладок.
//
// Раскладки — общие (slot/layouts.ts), своих здесь нет:
//   • колонка tableau  → pile({dx: 0, dy: шаг}) — канонический вертикальный каскад Клондайка
//     (НЕ веер: веер из спеки #92 уводил карты дугой ВВЕРХ на верхний ряд, см. §5.2 хендоффа);
//   • сток             → pile() с мелким стаггером — «толщина» колоды;
//   • сброс/фундаменты → pile({dx: 0, dy: 0}) — виден только верх;
//   • корень           → absolute — каждый слот на своём месте доски.
//
// Правила приёма живут на самой зоне (caps.drop.accept ← solitaireRules): слот сам решает, берёт
// ли он карту. Движок не дублирует правила, а спрашивает зону — и подсветка «куда можно ходить»
// получается из того же ответа, что и легальность хода.
//
// Доска — ФИКСИРОВАННОГО размера, не «viewport-aware»: под экран её подгоняет КАМЕРА (SceneEngine),
// а не пересчёт раскладки. Так размер карты не скачет от ширины окна (issue #68), ресайз не
// пересобирает сцену, а на узком экране доска видна целиком в зуме и приближается пинчем.

/** Размер карточной ячейки доски. Экранный размер = этот × зум камеры. */
export const CARD: Size = { w: 100, h: 143 };

const GAP = { x: 24, y: 30 };
const MARGIN = { x: 40, y: 30 };

/** Шаг каскада колонки: на сколько нижняя карта выступает из-под верхней. */
export const CASCADE_STEP = 40;

// На столько карт в колонке рассчитана высота доски. Худший случай Клондайка — 19 (6 закрытых +
// пробег K→A), но растягивать доску на него значит сплющить типичную партию. Длиннее — колонка
// просто выйдет за нижнюю кромку доски, и туда можно доскроллить камерой.
const CASCADE_FIT = 13;

// Мелкий стаггер стока — читается как толщина колоды. Вниз-вправо, а не вверх: иначе верх стопки
// вылезал бы за верхнюю кромку своего слота.
const STOCK_STAGGER = 0.45;

const TOP_ROW: readonly string[] = ["stock", "waste", ...FOUNDATION_KEYS];
const ALL_SLOTS: readonly string[] = [...TOP_ROW, ...TABLEAU_KEYS];

const COLS = TABLEAU_KEYS.length;
const TABLEAU_Y = MARGIN.y + CARD.h + GAP.y;
const COLUMN_H = CARD.h + (CASCADE_FIT - 1) * CASCADE_STEP;

/** Габарит доски в покое (без переросших колонок) — от него камера считает вписывание. */
export const BOARD_W = MARGIN.x * 2 + COLS * CARD.w + (COLS - 1) * GAP.x;
export const BOARD_H = TABLEAU_Y + COLUMN_H + MARGIN.y;

/** Левый верхний угол каждого слота на доске. Верхний ряд: сток и сброс слева, фундаменты — у
 *  правого поля (классическая раскладка: слева «рабочая» часть, справа «целевая»). */
export function slotOrigins(): Record<string, Vec> {
  const o: Record<string, Vec> = {};
  o.stock = { x: MARGIN.x, y: MARGIN.y };
  o.waste = { x: MARGIN.x + CARD.w + GAP.x, y: MARGIN.y };
  FOUNDATION_KEYS.forEach((key, i) => {
    const fromRight = FOUNDATION_KEYS.length - i;
    o[key] = { x: BOARD_W - MARGIN.x - fromRight * (CARD.w + GAP.x) + GAP.x, y: MARGIN.y };
  });
  TABLEAU_KEYS.forEach((key, i) => {
    o[key] = { x: MARGIN.x + i * (CARD.w + GAP.x), y: TABLEAU_Y };
  });
  return o;
}

export interface SolitaireTree {
  readonly root: Group;
  /** Габарит содержимого: не меньше доски, больше — если колонка переросла нижнюю кромку. */
  readonly size: Size;
  readonly origins: Readonly<Record<string, Vec>>;
  /** Центр карты в координатах доски (позиция покоя). null — карты на доске нет. */
  homeOf(cardId: string): Vec | null;
  /** Слот, в котором лежит карта. */
  slotOf(cardId: string): string | null;
  /** Порядок отрисовки: карта верхнего слота и более поздняя в стопке — выше. */
  depthOf(cardId: string): number;
  /** Слот-дропзона под точкой доски (по тому же дереву, что и рендер). */
  slotAt(cp: Vec): string | null;
  /** Возьмёт ли слот эту карту по правилам Клондайка. Спрашивается у самой зоны. */
  accepts(slotId: string, cardId: string): boolean;
}

/** Построить дерево под ТЕКУЩЕЕ состояние партии. Дерево — вид состояния, а не второй источник
 *  правды: любое изменение партии пересобирает его целиком (52 листа — дешевле, чем синхронизация). */
export function buildSolitaireTree(state: SolitaireGameState): SolitaireTree {
  const origins = slotOrigins();
  const groups = ALL_SLOTS.map((id) => slotGroup(id, state));
  const root = group(
    "sol-root",
    absolute(ALL_SLOTS.map((id) => origins[id]!)),
    groups,
  );

  const byId = new Map<string, Group>();
  groups.forEach((g) => byId.set(g.id, g));

  // Слот и глубина карты — из состояния (один проход), а не поиском по дереву на каждый кадр.
  const slotIndex = new Map<string, string>();
  const depth = new Map<string, number>();
  ALL_SLOTS.forEach((slotId, order) => {
    const members = boardAt(state.board, slotId)?.members ?? [];
    members.forEach((cardId, i) => {
      slotIndex.set(cardId, slotId);
      depth.set(cardId, order * 100 + i);
    });
  });

  const measured = measure(root);
  const size = { w: Math.max(BOARD_W, measured.w), h: Math.max(BOARD_H, measured.h) };

  return {
    root,
    size,
    origins,
    homeOf: (cardId) => leafHomeOf(root, cardId),
    slotOf: (cardId) => slotIndex.get(cardId) ?? null,
    depthOf: (cardId) => depth.get(cardId) ?? 0,
    slotAt: (cp) => dropTarget(root, cp)?.group.id ?? null,
    accepts: (slotId, cardId) => byId.get(slotId)?.caps?.drop?.accept?.(cardId) ?? false,
  };
}

function slotGroup(id: string, state: SolitaireGameState): Group {
  const members = boardAt(state.board, id)?.members ?? [];
  return group(id, slotLayout(id), members.map((cardId) => leaf(cardId, cardId, CARD)), dropCaps(id, state));
}

function slotLayout(id: string) {
  if (id.startsWith("tab:")) return pile({ dx: 0, dy: CASCADE_STEP, cell: CARD });
  if (id === "stock") return pile({ dx: STOCK_STAGGER, dy: STOCK_STAGGER, cell: CARD });
  return pile({ dx: 0, dy: 0, cell: CARD }); // сброс и фундаменты — важен только верх
}

// Дропзоны — только цели ходов. Сток и сброс их НЕ получают: в Клондайк в них не кладут (сток
// сдаёт по тапу, сброс наполняется сам), и зона без хода только перехватывала бы дроп у соседей.
function dropCaps(id: string, state: SolitaireGameState): Caps | undefined {
  if (!id.startsWith("found:") && !id.startsWith("tab:")) return undefined;
  const top = topId(boardAt(state.board, id) ?? { members: [] }) ?? null;
  const accept = id.startsWith("found:")
    ? (figure: string) => foundationKeyOf(figure) === id && foundationAccepts(figure, top)
    : (figure: string) => tableauAccepts(figure, top);
  // pad — половина зазора между слотами: дроп у самой кромки ловится, но соседние зоны не спорят.
  return { drop: { accept, pad: GAP.x / 2 } };
}
