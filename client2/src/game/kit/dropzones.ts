import { DropZone } from "../ui/DropZone";
import { SB_ITEM_GAP } from "../engine/sandboxLayout";
import type { Pt, SectionContext, SectionSize } from "./context";

// Ряд дроп-зон: перевернуть, сжечь, подглядеть. Фон+название — на поверхности, глагол — над картами.
//
// Зона принимает груз ПО СПОСОБНОСТИ, а не по типу: `accepts` спрашивает, есть ли у груза
// соответствующий метод. Отсюда и главное правило раздела — зона не имеет права «обещать» глаголом
// то, чего после дропа не сделает: подсветка гаснет ровно тогда, когда действие невозможно.
//
// ПОДГЛЯДЕТЬ — единственная из трёх, кто задействует armed («давай подсмотрим?»): зазывающий текст
// горит, пока драг способной карты идёт где-то ещё на канвасе, а не только над этой зоной. Текст
// при этом зависит от того, есть ли у ЭТОЙ карты что подглядывать (needsPeek): уже раскрытой карте
// зона отвечает «зачем?»/«нет.» и после дропа подглядывание не запускает.
//
// Одна колонка (задел под расширение набора): каждая зона — невысокая кнопка-полоса, а не карточный
// слот. Высота своя, не cardH — зона не притворяется местом ПОД карту, это список действий. Ширина
// по-прежнему от cardW: тот же язык масштабирования, что у всего стенда.

/** Пропорция полосы зоны — 16:9 (ширина:высота), прямое решение владельца. */
const ZONE_RATIO = 9 / 16;

/** Что зона СДЕЛАЛА с предметом. Пустая панель Actions значит «никто не подключил», а не «тихо». */
export interface ZoneEvent {
  zone: string;
  element: string;
  did: string;
}

export function dropzonesSection(ctx: SectionContext, at: Pt, onEvent?: (e: ZoneEvent) => void): SectionSize {
  const said = (zone: string, did: string, p: { lead: { id: string } }) => onEvent?.({ zone, element: p.lead.id, did });
  const zoneW = ctx.cardW * 2.4;
  const zoneH = zoneW * ZONE_RATIO;
  let y = at.y;

  ctx.zone(
    new DropZone({ name: "ПЕРЕВОРОТ", verb: "перевернуть", rect: { x: at.x, y, w: zoneW, h: zoneH } }),
    (p) => {
      p.flip?.();
      said("ПЕРЕВОРОТ", "перевернула", p);
    },
    (p) => !!p.flip,
  );
  y += zoneH + SB_ITEM_GAP;

  ctx.zone(
    new DropZone({ name: "СЖЕЧЬ", verb: "сжечь", rect: { x: at.x, y, w: zoneW, h: zoneH } }),
    (p) => {
      p.burn?.();
      said("СЖЕЧЬ", "сожгла", p);
    },
    (p) => !!p.burn,
  );
  y += zoneH + SB_ITEM_GAP;

  ctx.zone(
    new DropZone({ name: "ПОДГЛЯДЕТЬ", verb: "Отпускай!", armed: "давай подсмотрим?", rect: { x: at.x, y, w: zoneW, h: zoneH } }),
    (p) => {
      p.peek?.();
      said("ПОДГЛЯДЕТЬ", ctx.needsPeek(p.lead) ? "открыла на время" : "отказала — нечего подглядывать", p);
    },
    (p) => !!p.peek,
    (p) => (ctx.needsPeek(p.lead) ? { armed: "давай подсмотрим?", hot: "Отпускай!" } : { armed: "зачем?", hot: "нет." }),
  );

  return { bottom: y + zoneH, width: zoneW };
}
