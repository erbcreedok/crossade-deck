// СПЕКА HUD — экранный слой поверх борды (фикс к камере, не зумится). Layout-СИСТЕМА как данные:
// HUD — список ОБЛАСТЕЙ (area). Область = размещение + мини-флекс виджетов. Размещений два вида:
//   • регион краевой сетки {side, slot}: три региона на край (start/center/end), регионы одного
//     края делят один лейн; углы принадлежат ровно одному краю (corners) — наплывы соседних
//     краёв НЕВОЗМОЖНЫ по формуле, а не по дисциплине (разрешаются только явным bleed);
//   • пин {anchor, offset}: якорь к точке safe-прямоугольника, вне потока, поверх; мини-флекс
//     растёт от якоря внутрь экрана. «Карта всегда справа», инструмент у угла — это пины.
// Виджет остаётся собой, где бы ни жил (свойства зоны — в ЕЁ ZoneSpec); area решает только ГДЕ.

/** Край экрана. */
export type HudSide = "top" | "bottom" | "left" | "right";
/** Регион края: прижат к началу лейна, центрирован, прижат к концу. */
export type HudSlot = "start" | "center" | "end";
/** Угол экрана (для владения углом и якорей пинов). */
export type HudCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
/** Якорь пина: угол, середина края или центр экрана — точка НА safe-прямоугольнике. */
export type HudAnchor = HudCorner | "top-center" | "bottom-center" | "left-middle" | "right-middle" | "center";

/** Длина виджета вдоль области: px-константа | {fr} — доля свободного лейна | "auto" (= {fr:1}).
 *  В пинах доли смысла не имеют (у пина нет лейна) — validate предупреждает. */
export type HudSize = number | { fr: number } | "auto";

/** Виджет области: ЛЮБАЯ зона борды по id (свойства живут в её ZoneSpec) или placeholder-пустышка
 *  (макет будущей кнопки/реакций). Виджет зоны есть → СВОЙ экземпляр зоны на экране; нет → зона
 *  живёт на борде. */
export type HudWidget =
  | { kind: "zone"; zone: string; size?: HudSize }
  | { kind: "placeholder"; label?: string; size?: HudSize };

/** Размещение области: регион краевой сетки ИЛИ пин (якорь + смещение). */
export type HudPlace =
  | { region: { side: HudSide; slot: HudSlot } }
  | { pin: { anchor: HudAnchor; offset?: { x: number; y: number }; reserve?: boolean } };

/** ОБЛАСТЬ — атом HUD: размещение + мини-флекс виджетов (порядок — порядок массива, длины —
 *  size). Прижим выражается ВЫБОРОМ региона (start/center/end), не отдельным полем. */
export interface HudArea {
  place: HudPlace;
  widgets: readonly HudWidget[];
  /** Зазор между виджетами области (дефолт 10). */
  gap?: number;
  /** Дальность области от СВОЕГО края (px) ПОВЕРХ safe-zone сцены (рычаг движка setSafeArea). */
  inset?: number;
  /** Ось мини-флекса пина (у региона ось всегда вдоль края). Дефолт — вдоль ближайшего края. */
  flow?: "horizontal" | "vertical";
  /** ЯВНОЕ разрешение наплыть на угловой вычет своего лейна (дефолт false — наплывов нет). */
  bleed?: boolean;
}

/** HUD целиком: список областей + владельцы спорных углов. Угол оспаривается, только когда ОБА
 *  смежных края непусты; дефолтный владелец — ГОРИЗОНТАЛЬНЫЙ край (top/bottom). Пустой угол
 *  отдаёт место соседям сам — лейн непустого края тянется до safe-границы. */
export interface HudSpec {
  areas: readonly HudArea[];
  corners?: Partial<Record<HudCorner, HudSide>>;
}

/** Поля вокруг прямоугольника (safe-zone устройства и резервы стола — один словарь). */
export interface EdgeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// ——— сахар сборки областей (спеки и стори пишут раскладку одной строкой) ———

type AreaOver = Partial<Omit<HudArea, "place" | "widgets">>;

/** Область-регион: `region("bottom", "start", [zoneW("hand")])`. */
export function region(side: HudSide, slot: HudSlot, widgets: readonly HudWidget[], over: AreaOver = {}): HudArea {
  return { place: { region: { side, slot } }, widgets, ...over };
}

/** Область-пин: `pin("bottom-right", [zoneW("pouch", 72)], {offset: {x: -8, y: -90}})`. */
export function pin(anchor: HudAnchor, widgets: readonly HudWidget[], over: AreaOver & { offset?: { x: number; y: number }; reserve?: boolean } = {}): HudArea {
  const { offset, reserve, ...rest } = over;
  return { place: { pin: { anchor, ...(offset ? { offset } : {}), ...(reserve ? { reserve } : {}) } }, widgets, ...rest };
}

/** Виджет-зона. */
export function zoneW(zone: string, size?: HudSize): HudWidget {
  return { kind: "zone", zone, ...(size !== undefined ? { size } : {}) };
}

/** Виджет-заглушка. */
export function placeholderW(label: string, size?: HudSize): HudWidget {
  return { kind: "placeholder", label, ...(size !== undefined ? { size } : {}) };
}

/** Регион размещения области, если она — регион (иначе null). */
export function regionOf(area: HudArea): { side: HudSide; slot: HudSlot } | null {
  return "region" in area.place ? area.place.region : null;
}

/** Пин размещения области, если она — пин (иначе null). */
export function pinOf(area: HudArea): { anchor: HudAnchor; offset?: { x: number; y: number }; reserve?: boolean } | null {
  return "pin" in area.place ? area.place.pin : null;
}

/** Ближайший край якоря пина — там живёт его лента (мини-флекс растёт от якоря внутрь). */
export function anchorSide(anchor: HudAnchor): HudSide {
  if (anchor === "left-middle") return "left";
  if (anchor === "right-middle") return "right";
  return anchor.startsWith("top") ? "top" : "bottom"; // углы и center — у горизонталей
}
