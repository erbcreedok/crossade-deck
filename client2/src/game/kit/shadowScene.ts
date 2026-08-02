import { Button } from "../ui/Button";
import type { AnimPreset } from "../anim/presets";
import type { Pose } from "../ui/Card";
import type { Pt, SectionContext, SectionSize } from "./context";

// ТЕНИ И «ТРЁХМЕРНЫЙ ИНДЕКС» СТОЛА.
//
// Стол плоский, но предметы на нём НА РАЗНОЙ ВЫСОТЕ, и вся объёмность держится на двух вещах:
//
//  1. ПЛАН (rest / lifted / held). Он же — СЛОЙ отрисовки: лежащие карты рисуются ниже поднятых,
//     поднятые ниже тех, что в руке. Никаких «z-index на глаз»: слой выводится из плана
//     (`levelOf`), поэтому поднятая карта не может случайно оказаться под лежащей.
//  2. ТЕНЬ. Она отвечает на единственный вопрос — «как высоко предмет над столом». Дальше и
//     крупнее тень = выше предмет. Больше никаких сигналов высоты у плоской картинки нет.
//
// ГЛАВНОЕ ПРО ОТРИСОВКУ: тени всех предметов ОДНОГО слоя сливаются в ОДНУ маску и заливаются одним
// цветом (ui/ShadowLayer). Это не оптимизация. Рисуй каждый свою — в местах пересечения тени
// складывались бы и темнели, и две лежащие рядом карты выглядели бы так, будто между ними дыра.
// Отсюда же следует, что размыть край нечем: маска общая, и размытие пришлось бы вешать на весь
// слой целиком.
//
// ВНУТРИ слоя порядок задаёт глубина постановки (`zOf`), а не случайность: у стопки это порядок
// карт, и он должен переживать драг — карта, которую подняли и отпустили, обязана вернуться на
// СВОЁ место, а не наверх.

export type ShadowSubject = "card" | "chip" | "chess" | "mixed";

export interface ShadowSceneOpts {
  /** На чём смотрим: у карты форма прямоугольная, у лежащей фишки — эллипс, у фигуры — своя. */
  subject: ShadowSubject;
  /** План покоя — он же слой отрисовки и он же высота. */
  pose: Pose;
  preset: AnimPreset;
  /** Сколько карт положить внахлёст: на них видно, что тени СЛИВАЮТСЯ, а не темнят друг друга. */
  overlap: number;
  /** Показать все три плана рядом — сравнение высот. */
  compare: boolean;
  /**
   * Положить поднятую карту ПОВЕРХ лежащей. Тени разложены по СЛОЯМ (`levelOf`), и тень поднятой
   * рисуется в своём слое — то есть ложится НА лежащую карту, а не под неё.
   */
  crossLevel: boolean;
  /** Добавить кнопку: у неё тень СВОЯ, вне общего пасса. */
  withButton: boolean;
}

const PLANS: readonly { pose: Pose; caption: string }[] = [
  { pose: "rest", caption: "rest — лежит: тень своего размера, почти под предметом" },
  { pose: "lifted", caption: "lifted — поднят: тень дальше и крупнее" },
  { pose: "held", caption: "held — держат: тень самая дальняя" },
];

export function shadowScene(ctx: SectionContext, at: Pt, o: Partial<ShadowSceneOpts> = {}, idPrefix = "sh"): SectionSize {
  const preset = o.preset;
  const overlap = Math.max(1, o.overlap ?? 1);
  let bottom = at.y;
  let width = 0;

  const subject = o.subject ?? "card";
  let moved = false;

  /** Уничтожить выбранным стилем: тень обязана резаться ТОЙ ЖЕ маской, что и предмет. */
  const burnWith = (style: string) => {
    for (const id of placed) {
      const el = ctx.element(id) as { setAnimPreset?: (p: AnimPreset) => void; burn?: () => void } | undefined;
      if (preset) el?.setAnimPreset?.({ ...preset, destroy: { ...preset.destroy, style } });
      el?.burn?.();
    }
    ctx.wake();
  };

  const put = (x: number, y: number, pose: Pose, prefix: string, caption: string) => {
    const ids: string[] = [];
    // Внахлёст с шагом меньше карты: перекрытие теней — единственное, на чём видно, что они
    // сливаются в одну маску, а не складываются.
    const step = ctx.cardW * 0.45;
    const r = ctx.cardH * 0.28;
    for (let i = 0; i < overlap; i++) {
      const id = `${prefix}-${i}`;
      const cx = x + ctx.cardW / 2 + i * step;
      const kind = subject === "mixed" ? (["card", "chip", "chess"] as const)[i % 3]! : subject;
      if (kind === "card") ctx.card({ id, card: ["A♠", "K♥", "Q♦", "10♣"][i % 4]!, pose }, { x: cx, y: y + ctx.cardH / 2 }, i);
      // Форма тени — от предмета, а не от типа: у лежащей фишки эллипс (это и есть её форма), у
      // стоящей фигуры — её собственный силуэт, снятый с визуала и положенный на стол. Прямоугольная
      // тень под круглой фишкой сразу читается как чужая, а «пятно вообще» под конём — как ничья.
      else ctx.piece(id, { x: cx, y: y + ctx.cardH / 2 }, kind === "chip" ? { kind: "chip", color: 0xc79a3e, denom: "25" } : { kind: "chess", dark: i % 2 === 0, glyph: "♞" }, r);
      ids.push(id);
    }
    if (preset) ctx.setAnimPreset(ids, preset);
    const w = ctx.cardW + (overlap - 1) * step;
    const cap = ctx.label(caption, x, y + ctx.cardH + 16, 12, 0x9aa89f, Math.max(w, ctx.cardW * 2), 0);
    return { w: Math.max(w, cap.width), bottom: y + ctx.cardH + 16 + cap.height, ids };
  };

  if (o.crossLevel) {
    // Два уровня друг над другом. Единственное место, где видно, что тени НЕ сливаются между
    // слоями: тень поднятой карты ложится на лежащую, а не прячется под ней.
    const x = at.x;
    const y = at.y;
    ctx.card({ id: `${idPrefix}-under`, card: "7♣", pose: "rest" }, { x: x + ctx.cardW / 2, y: y + ctx.cardH / 2 }, 0);
    ctx.card({ id: `${idPrefix}-over`, card: "A♠", pose: "held" }, { x: x + ctx.cardW * 0.95, y: y + ctx.cardH * 0.62 }, 1);
    if (preset) ctx.setAnimPreset([`${idPrefix}-under`, `${idPrefix}-over`], preset);
    const cap = ctx.label("тень удерживаемой карты ложится НА лежащую: слои теней разные", x, y + ctx.cardH * 1.25, 12, 0x9aa89f, ctx.cardW * 3, 0);
    return { bottom: y + ctx.cardH * 1.25 + cap.height, width: ctx.cardW * 3 };
  }

  // Собираем всё, что расставили: кнопки действий работают сразу по всей сцене.
  const placed: string[] = [];

  if (o.compare) {
    // Три плана рядом — это НЕ «витрина вариантов»: смысл раздела в том, что высоту читают
    // СРАВНЕНИЕМ. Одна тень сама по себе ничего не сообщает, пока не с чем сопоставить.
    let x = at.x;
    for (const p of PLANS) {
      const r = put(x, at.y, p.pose, `${idPrefix}-${p.pose}`, p.caption);
      placed.push(...r.ids);
      x += r.w + ctx.cardW * 0.7;
      bottom = Math.max(bottom, r.bottom);
    }
    width = x - at.x - ctx.cardW * 0.7;
  } else {
    const plan = PLANS.find((p) => p.pose === (o.pose ?? "rest"))!;
    const r = put(at.x, at.y, plan.pose, idPrefix, plan.caption);
    placed.push(...r.ids);
    width = r.w;
    bottom = r.bottom;
  }
  // ДЕЙСТВИЯ — кнопками на сцене, а не рычагами в панели: панель описывает СВОЙСТВА тени, а
  // «перевернуть» и «сжечь» это события предмета. Тень при них ничего своего не делает — она
  // выводится из состояния, и смотреть надо именно на это.
  {
    const acts: { label: string; variant?: "secondary" | "danger" | "ghost"; run: () => void }[] = [
      { label: "перевернуть", run: () => placed.forEach((id) => ctx.dispatch({ t: "flip", id })) },
      {
        label: "переместить",
        run: () => {
          moved = !moved;
          const dx = moved ? ctx.cardW * 1.6 : -ctx.cardW * 1.6;
          placed.forEach((id) => {
            const el = ctx.element(id);
            if (el) ctx.dispatch({ t: "move", id, x: el.body.px + dx, y: el.body.py });
          });
        },
      },
      { label: "сжечь", variant: "danger", run: () => burnWith("burn") },
      { label: "шреддер", variant: "danger", run: () => burnWith("shred") },
      { label: "вернуть", variant: "ghost", run: () => ctx.appear(placed) },
    ];
    let bx = at.x;
    let bh = 0;
    for (const a of acts) {
      const b = new Button({ label: a.label, variant: a.variant ?? "secondary", size: "sm", onClick: a.run });
      ctx.button(b, { x: bx + b.w / 2, y: bottom + 34 });
      bx += b.w + 12;
      bh = Math.max(bh, b.h);
    }
    bottom = bottom + 34 + bh / 2;
    width = Math.max(width, bx - at.x - 12);
  }

  if (o.withButton) {
    // Кнопка отбрасывает тень САМА, не через общий пасс: она интерфейс поверх стола, и попади её
    // силуэт в общую маску — затемняла бы карты под собой.
    const b = new Button({ label: "своя тень", variant: "primary", size: "md", elevation: 12 });
    ctx.button(b, { x: at.x + b.w / 2, y: bottom + 40 });
    const cap = ctx.label("у кнопки тень своя, вне общего пасса", at.x, bottom + 40 + b.h / 2 + 10, 12, 0x9aa89f, ctx.cardW * 3, 0);
    bottom = bottom + 40 + b.h / 2 + 10 + cap.height;
    width = Math.max(width, ctx.cardW * 3);
  }
  return { bottom, width };
}
