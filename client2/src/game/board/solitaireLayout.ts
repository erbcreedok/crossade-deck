// Чистая геометрия слотов пасьянса (viewport-aware), без Pixi — только числа, полностью
// юнит-тестируется в node-окружении. Порт алгоритма из SOLITAIRE-TECHNICAL-SPEC.md §1.2:
// верхний ряд (stock/waste/4 фундамента) + centered-ряд из 7 столбцов tableau под ним.

export interface SlotGeometry {
  x: number;
  y: number;
  w: number; // width
  h: number; // height
  layout: "stack" | "fan" | "single";

  // Для веерной раскладки (tableau)
  fanRadius?: number;
  fanStartAngle?: number;
  fanSpreadAngle?: number;
  maxVisible?: number;

  // Для стопки (stock, фундаменты) — смещение на карту (эффект 3D-стопки)
  cardOffset?: { x: number; y: number };
}

export interface LayoutProfile {
  cardSize: { w: number; h: number };
  margins: { top: number; bottom: number; left: number; right: number };
  slotGap: { x: number; y: number };
}

// Профили под три диапазона ширины экрана — точные значения из §1.2, менять только синхронно
// со спекой.
export const LAYOUT_PROFILES: { mobile: LayoutProfile; tablet: LayoutProfile; desktop: LayoutProfile } = {
  mobile: {
    cardSize: { w: 60, h: 85 },
    margins: { top: 10, bottom: 10, left: 8, right: 8 },
    slotGap: { x: 8, y: 12 },
  },
  tablet: {
    cardSize: { w: 80, h: 115 },
    margins: { top: 20, bottom: 20, left: 20, right: 20 },
    slotGap: { x: 16, y: 20 },
  },
  desktop: {
    cardSize: { w: 100, h: 143 },
    margins: { top: 30, bottom: 30, left: 40, right: 40 },
    slotGap: { x: 24, y: 30 },
  },
};

/**
 * Раскладка всех 13 слотов пасьянса для текущего viewport.
 * Возвращает геометрию для stock, waste, 4 фундаментов и 7 столбцов tableau.
 */
export function getSolitaireLayout(
  vpWidth: number,
  vpHeight: number,
  profile: "mobile" | "tablet" | "desktop" = "mobile"
): Record<string, SlotGeometry> {
  const p = LAYOUT_PROFILES[profile];
  const { cardSize, margins, slotGap } = p;

  // Верхний ряд: Stock, Waste, Фундаменты (4)
  const topRowY = margins.top;
  const topRowH = cardSize.h;
  let topRowX = margins.left;

  const result: Record<string, SlotGeometry> = {};

  // Stock
  result.stock = {
    x: topRowX,
    y: topRowY,
    w: cardSize.w,
    h: topRowH,
    layout: "stack",
    cardOffset: { x: 3, y: 3 },
  };
  topRowX += cardSize.w + slotGap.x;

  // Waste (одна открытая карта — просто "single", без стопочного смещения)
  result.waste = {
    x: topRowX,
    y: topRowY,
    w: cardSize.w,
    h: topRowH,
    layout: "single",
  };
  // Фундаменты — четвёркой у ПРАВОГО края, как в классической раскладке Клондайка: слева
  // «рабочая» часть (сток/сброс), справа «целевая». Прижимаем к правому полю, а не отступаем
  // от сброса, иначе на широком экране четвёрка повисает посреди пустоты.
  const foundSuits = ["S", "H", "D", "C"];
  const foundBlockW = (cardSize.w + slotGap.x) * 4 - slotGap.x;
  // Но не залезать на сброс, если экран узкий — тогда просто встаём следом за ним.
  let foundX = Math.max(topRowX + cardSize.w + slotGap.x * 2, vpWidth - margins.right - foundBlockW);
  for (let i = 0; i < 4; i++) {
    result[`found:${foundSuits[i]}`] = {
      x: foundX,
      y: topRowY,
      w: cardSize.w,
      h: topRowH,
      layout: "stack",
      cardOffset: { x: 0, y: 0 }, // в фундаменте важна только верхняя карта — стопка ровная
    };
    foundX += cardSize.w + slotGap.x;
  }

  // Ряд tableau: 7 столбцов ВЕРТИКАЛЬНЫМ КАСКАДОМ.
  //
  // Раньше здесь стоял layout:"fan" — так требовал критерий приёмки issue #92 и §1.2. Это
  // оказалось ошибкой спеки, а не задумкой: веер раскрывался по дуге радиусом в треть карты от
  // угла 1.5π, то есть карты колонки уезжали ВВЕРХ, на верхний ряд, накрывая сток и фундаменты.
  // Последствия были не косметические — клик по стоку попадал в наехавшую карту колонки вместо
  // стока (карты «не раздавались»), а дроп искался по прямоугольнику колонки, который начинался
  // НИЖЕ того места, где карты реально нарисованы (ничего никуда не переставлялось). Канон
  // Клондайка — каскад: карты сдвинуты вниз на фиксированный шаг, без поворота, видны индексы.
  const tableauStartY = topRowY + topRowH + slotGap.y;
  const tableauW = (cardSize.w + slotGap.x) * 7 - slotGap.x;
  const tableauStartX = Math.max(margins.left, (vpWidth - tableauW) / 2);
  const availH = Math.max(cardSize.h, vpHeight - tableauStartY - margins.bottom);

  // Шаг каскада считаем ОТ ДОСТУПНОЙ ВЫСОТЫ, а не константой: иначе доска жила бы в верхней
  // трети десктопа. CASCADE_FIT — на сколько карт колонки раскладка рассчитана «без тесноты»
  // (длиннее бывает, но редко); дальше карты просто лягут плотнее нижней границы.
  const cascadeStep = Math.max(14, Math.min(cardSize.h * 0.34, (availH - cardSize.h) / (CASCADE_FIT - 1)));

  for (let col = 0; col < 7; col++) {
    result[`tab:${col}`] = {
      x: tableauStartX + col * (cardSize.w + slotGap.x),
      y: tableauStartY,
      w: cardSize.w,
      h: availH,
      layout: "stack",
      cardOffset: { x: 0, y: cascadeStep },
    };
  }

  return result;
}

// На столько карт в колонке рассчитан шаг каскада. Худший случай Клондайка — 19 (6 закрытых +
// пробег от короля до туза), но растягивать шаг на него значит сплющить типичную партию в
// нечитаемую полоску. 13 — компромисс: типичная колонка дышит, экстремальная слегка потеснится.
const CASCADE_FIT = 13;

// Брейкпоинты по ширине viewport — совпадают с общими медиа-запросами проекта.
export function selectProfile(vpWidth: number, vpHeight: number): "mobile" | "tablet" | "desktop" {
  void vpHeight; // высота пока не влияет на выбор профиля, оставлена для симметрии сигнатуры
  if (vpWidth < 600) return "mobile";
  if (vpWidth < 1024) return "tablet";
  return "desktop";
}

/**
 * Раскладывает cardCount карт по дуге слота tableau. Для нефанового слота (stack/single)
 * веер не имеет смысла — все карты лежат в одной базовой точке без поворота.
 */
export function calculateFanPositions(
  baseX: number,
  baseY: number,
  cardCount: number,
  geom: SlotGeometry
): Array<{ x: number; y: number; rotation: number }> {
  if (geom.layout !== "fan") {
    // .fill() с одним объектом дал бы cardCount ссылок на один и тот же объект — здесь это
    // не страшно (потребитель не мутирует позиции), но Array.from на всякий случай создаёт
    // независимые объекты, чтобы поведение не отличалось от fan-ветки.
    return Array.from({ length: cardCount }, () => ({ x: baseX, y: baseY, rotation: 0 }));
  }

  const result: Array<{ x: number; y: number; rotation: number }> = [];
  // Math.max(1, ...) защищает от деления на ноль при одной карте (cardCount - 1 === 0).
  const spread = geom.fanSpreadAngle! / Math.max(1, cardCount - 1);

  for (let i = 0; i < cardCount; i++) {
    const angle = geom.fanStartAngle! + i * spread;
    const r = geom.fanRadius!;
    const x = baseX + Math.cos(angle) * r;
    const y = baseY + Math.sin(angle) * r;
    result.push({ x, y, rotation: angle - Math.PI / 2 });
  }

  return result;
}
