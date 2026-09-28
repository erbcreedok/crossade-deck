// СКИНЫ — кем человек сидит за столом, и сколько у фигуры сторон. Как в старых 3D-играх на спрайтах (Doom):
// фигура плоская, но у неё несколько нарисованных ракурсов, и каждый кадр показывается тот, что ближе к
// тому, откуда на неё смотрят. У палки ракурс один, у короля и дамы — лицо и спина, у пса и кошки — ещё
// бока, у кубика — все шесть сторон.
//
// Одно место на сервер, веб и Unity: чистые данные и чистый выбор ракурса.

/** Направления ракурсов в осях самой фигуры: x — её правая рука, y — куда она смотрит, z — вверх. */
export const VIEW_DIRS: Record<string, readonly [number, number, number]> = {
  front: [0, 1, 0],
  back: [0, -1, 0],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
};

/** Откуда берутся картинки скина — у каждого источника свой пекарь на клиенте (`dollSprites.ts`). */
export type SkinSource = "deck" | "files" | "cube" | "stick";

export interface Skin {
  id: string;
  name: string;
  source: SkinSource;
  /** Нарисованные ракурсы. */
  views: readonly string[];
  /** Ракурсы, которые берутся отражением нарисованного: `left` — это `right` наоборот. */
  mirror?: Readonly<Record<string, string>>;
  /** Перекрашивается ли расцветкой (три краски колоды). */
  recolor: boolean;
}

export const SKINS: readonly Skin[] = [
  { id: "king", name: "Король треф", source: "deck", views: ["front", "back"], recolor: true },
  { id: "queen", name: "Дама бубен", source: "deck", views: ["front", "back"], recolor: true },
  ...([
    ["club-J", "Валет треф"], ["club-Q", "Дама треф"],
    ["diamond-J", "Валет бубен"], ["diamond-K", "Король бубен"],
    ["heart-J", "Валет червей"], ["heart-Q", "Дама червей"], ["heart-K", "Король червей"],
    ["spade-J", "Валет пик"], ["spade-Q", "Дама пик"], ["spade-K", "Король пик"],
  ] as const).map(([id, name]): Skin => ({ id, name, source: "deck", views: ["front", "back"], recolor: true })),
  { id: "dog", name: "Пёс", source: "files", views: ["front", "back", "right"], mirror: { left: "right" }, recolor: true },
  { id: "cat", name: "Кошка", source: "files", views: ["front", "back", "right"], mirror: { left: "right" }, recolor: true },
  { id: "crusader", name: "Крестоносец", source: "files", views: ["front", "back", "right", "top", "bottom"], mirror: { left: "right" }, recolor: true },
  { id: "cube", name: "Кубик", source: "cube", views: ["front", "back", "right", "left", "top", "bottom"], recolor: true },
  { id: "stick", name: "Палка", source: "stick", views: ["front"], recolor: false },
];

export const skinOf = (id: string): Skin | undefined => SKINS.find((s) => s.id === id);

/** Все ракурсы скина, какие можно показать: нарисованные и отражённые. */
export const shownViews = (skin: Skin): string[] => [...skin.views, ...Object.keys(skin.mirror ?? {})];

/** Запас, с которым ракурс держится на границе: иначе на стыке двух он мигает туда-обратно. */
export const VIEW_HOLD = 0.08;

/**
 * КАКОЙ РАКУРС ПОКАЗАТЬ: `toViewer` — откуда смотрят, в осях фигуры (x — её правая рука, y — вперёд, z — вверх),
 * не обязательно единичный. Ближайший по направлению; прежний (`was`) держится, пока новый лучше не больше
 * чем на `VIEW_HOLD`.
 */
export function pickView(skin: Skin, toViewer: readonly [number, number, number], was?: string): string {
  const len = Math.hypot(...toViewer) || 1;
  const v = toViewer.map((c) => c / len);
  const score = (name: string) => {
    const d = VIEW_DIRS[name];
    return d ? d[0] * v[0]! + d[1] * v[1]! + d[2] * v[2]! : -Infinity;
  };
  const all = shownViews(skin);
  let best = all[0]!;
  for (const name of all) if (score(name) > score(best)) best = name;
  if (was && all.includes(was) && score(was) >= score(best) - VIEW_HOLD) return was;
  return best;
}

/** Картинка ракурса: какой нарисованный ракурс брать и отражать ли его. */
export function drawnView(skin: Skin, view: string): { view: string; mirror: boolean } {
  const from = skin.mirror?.[view];
  return from ? { view: from, mirror: true } : { view, mirror: false };
}
