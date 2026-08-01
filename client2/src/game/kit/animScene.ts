import { Button } from "../ui/Button";
import type { AnimPreset } from "../anim/presets";
import { stackState } from "./stacks";
import { linear, type StackLayout } from "./stackLayout";
import type { Pose } from "../ui/Card";
import type { Pt, SectionContext, SectionSize } from "./context";

// АНИМАЦИЯ НА РАЗНЫХ ЦЕЛЯХ: одна карта, раскрытая пачка, сомкнутая колода, фишка.
//
// Общая сцена ВСЕХ разделов «Анимации»: они отличаются не устройством, а тем, какое действие
// вешается на кнопку. Цель — параметр, а не отдельный раздел на каждую: механизм один, а выглядит
// и работает по-разному, и увидеть разницу можно только переключением на месте.
//
//   карта  — свой переворот: настоящее вращение на 180°, а не подмена текстуры;
//   колода — та же пачка, но СОМКНУТАЯ и рубашкой вверх. Отдельная цель не ради красоты: на
//            сомкнутой колоде волна не видна вовсе (карты закрывают друг друга), а разворот
//            порядка, наоборот, виден только на ней — верхняя карта уходит вниз;
//   пачка  — СВОЯ операция поверх карточной: у неё расписание (разом или волной) и, возможно,
//            разворот порядка. Это не N одиночных флипов, и именно поэтому она живёт в движке
//            отдельным методом (SceneEngine.flipGroup);
//   фишка  — НЕ переворачивается вовсе. Она не Flippable, у неё нет второй стороны, и зона
//            «ПЕРЕВОРОТ» это видит по СПОСОБНОСТИ, а не по типу. Пустая витрина тут была бы
//            обманом: «не умеет» — такой же факт о движке, как «умеет».

export type AnimTarget = "card" | "stack" | "deck" | "piece";

/** Действие на кнопке. `ids` — то, что сцена расставила. */
export interface AnimAction {
  label: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  run: (ids: string[]) => void;
}

export interface AnimSceneOpts {
  target: AnimTarget;
  preset: AnimPreset;
  /** Сколько карт в пачке. У одиночной цели не действует. */
  count: number;
  /** Раскладка пачки. По умолчанию раскрытая: на сомкнутой колоде волны не видно вовсе. */
  layout: StackLayout;
  /** Чем вверх лежит пачка. У колоды по умолчанию рубашкой. */
  faceUp: boolean;
  /** ПОЗА покоя: лежит на столе, поднят над ним или его держат. */
  pose: Pose;
  /** Дышит ли элемент. Не задано — по позе: поднятый дышит, лежащий нет. */
  idle?: boolean;
}

/** Пояснение, почему у этой цели действие не сработает. Пусто — сработает. */
export type TargetNote = (target: AnimTarget) => string;

const DEFAULT_LAYOUT = linear({ step: 0.72 });
/** Колода: карты почти совмещены — видна верхняя и толщина пачки. */
const DECK_LAYOUT = linear({ step: 0.06 });

export function animScene(ctx: SectionContext, at: Pt, o: Partial<AnimSceneOpts> = {}, actions: readonly AnimAction[] = [], note?: TargetNote, idPrefix = "an"): SectionSize & { ids: string[] } {
  const target = o.target ?? "card";
  const preset = o.preset;
  let ids: string[] = [];
  let bottom = at.y;
  let width = ctx.cardW;

  if (target === "stack" || target === "deck") {
    const deck = target === "deck";
    const st = stackState(
      ctx,
      at,
      { form: o.layout ?? (deck ? DECK_LAYOUT : DEFAULT_LAYOUT), faceUp: o.faceUp ?? !deck, pose: o.pose ?? "rest", idle: o.idle, count: o.count ?? (deck ? 12 : 5) },
      idPrefix,
    );
    ids = st.ids;
    bottom = st.bottom;
    width = st.width;
  } else if (target === "card") {
    const id = `${idPrefix}-solo`;
    ctx.card({ id, card: "A♠", pose: o.pose ?? "rest", idle: o.idle }, { x: at.x + ctx.cardW / 2, y: at.y + ctx.cardH / 2 });
    ids = [id];
    bottom = at.y + ctx.cardH;
  } else {
    const r = ctx.cardH * 0.3;
    const id = `${idPrefix}-chip`;
    ctx.piece(id, { x: at.x + r, y: at.y + r }, { kind: "chip", color: 0xc79a3e, denom: "25" }, r, 0, { pose: o.pose ?? "rest", idle: o.idle });
    ids = [id];
    bottom = at.y + r * 2;
    width = r * 2;

  }

  if (preset) ctx.setAnimPreset(ids, preset);

  const hint = note?.(target) ?? "";

  const by = bottom + 30;
  let bx = at.x;
  let bh = 0;
  for (const a of actions) {
    const b = new Button({ label: a.label, variant: a.variant ?? "secondary", size: "sm", onClick: () => a.run(ids) });
    ctx.button(b, { x: bx + b.w / 2, y: by });
    bx += b.w + 14;
    bh = Math.max(bh, b.h);
  }
  bottom = by + bh / 2;
  width = Math.max(width, bx - at.x - 14);

  if (hint) {
    const cap = ctx.label(hint, at.x, bottom + 12, 13, 0xcdb98f, ctx.cardW * 3, 0);
    bottom += 12 + cap.height;
    width = Math.max(width, ctx.cardW * 3);
  }
  return { bottom, width, ids };
}
