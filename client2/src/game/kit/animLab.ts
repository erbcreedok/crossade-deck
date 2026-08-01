import { Button } from "../ui/Button";
import type { Card } from "../ui/Card";
import type { AnimPreset } from "../anim/presets";
import { stackState, type StackForm } from "./stacks";
import type { Pt, SectionContext, SectionSize } from "./context";

// ЛАБОРАТОРИЯ АНИМАЦИЙ — одна витрина, на которой видно всё, что умеет пресет.
//
// Раньше на каждый пресет была своя стори, и это ошибка: пресет — ЗНАЧЕНИЕ, а не отдельный экран.
// Шесть одинаковых страниц, отличающихся одной строкой аргументов, ничего не показывают сверх
// одной страницы с выбором из шести — зато прячут главное: пресеты сравнивают, переключая их на
// одной и той же сцене, а не листая между экранами.
//
// Фил задаётся не сцене, а ЭЛЕМЕНТАМ (ctx.setAnimPreset) — на настоящем столе колода и сброс живут
// рядом с разным характером. Показывать это рядом стоящими пачками не нужно: две одинаковые
// картинки под разными пресетами — та же витрина «всё сразу», от которой мы уходим.

export interface AnimRow {
  /** Заголовок ряда — что это за пачка. */
  title: string;
  /** Фил именно этой пачки. */
  preset: AnimPreset;
  count?: number;
  /** Как пачка разложена и чем вверх. Раздел про ДВИЖЕНИЕ, но движение закрытой пачки выглядит
   *  иначе: у рубашек нет разницы между картами, и волна по ним читается только по геометрии. */
  form?: StackForm;
  faceUp?: boolean;
}

/**
 * Ряд: пачка + две кнопки. Обе операции идут через штатные двери движка (`flipStack`, `burn`),
 * поэтому здесь видно ровно то, что произойдёт в игре, а не отдельная демо-анимация.
 */
export function animRow(ctx: SectionContext, at: Pt, row: AnimRow, idPrefix: string): SectionSize & { ids: string[] } {
  const st = stackState(ctx, { x: at.x, y: at.y + 26 }, { form: row.form ?? "spread", faceUp: row.faceUp ?? true, count: row.count ?? 5 }, idPrefix);
  ctx.setAnimPreset(st.ids, row.preset);
  ctx.label(row.title, at.x, at.y, 13, 0xcdb98f, undefined, 0);

  const flip = new Button({ label: "перевернуть", variant: "secondary", size: "sm", onClick: () => ctx.flipStack(st.ids) });
  const kill = new Button({
    label: "уничтожить",
    variant: "danger",
    size: "sm",
    // Уничтожение — операция КАРТЫ, а не доски: это её собственная анимация, а не перемещение,
    // которое можно выразить командой. Поэтому дёргаем элемент напрямую (см. ctx.element).
    onClick: () => {
      for (const id of st.ids) (ctx.element(id) as Card | undefined)?.burn?.();
      ctx.wake();
    },
  });
  // «Появиться» проигрывает появление ЗАНОВО — у живых карт. Воскрешать она не умеет и не должна:
  // догоревшая карта помечается dead и выбывает из реестра сцены (reapDead), это поведение стола,
  // а не витрины, и гнуть его ради демо значило бы показывать не тот движок, что в игре.
  // Уничтоженный ряд возвращается пересборкой — любой правкой рычага в панели.
  const show = new Button({ label: "появиться", variant: "ghost", size: "sm", onClick: () => ctx.appear(st.ids) });
  const by = st.bottom + 28;
  let x = at.x;
  for (const b of [show, flip, kill]) {
    ctx.button(b, { x: x + b.w / 2, y: by });
    x += b.w + 14;
  }

  // Подписи со списком стилей тут нет: она дублировала панель и при этом врала — рисуется один раз
  // при сборке, а стиль применяется в МОМЕНТ события, и после правки рычага показывала прежнее.
  return { bottom: by + kill.h / 2, width: Math.max(st.width, x - at.x - 14), ids: st.ids };
}
