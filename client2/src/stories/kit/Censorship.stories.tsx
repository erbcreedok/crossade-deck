import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { CUSTOM_FACE_IDS } from "../../game/engine/cardTextures";
import { DANCE_DEFAULT, dustParams } from "../../game/censorConfig";
import { CanvasStage } from "../harness/CanvasStage";

// ЦЕНЗУРА — «TG-пыль» поверх карты. Это СВОЙСТВО КАРТЫ, а не отдельная механика: оно включается
// флагом `censored`, живёт внутри `ui/Card` и настраивается теми же рычагами, что остальная карта.
// Поэтому раздел стоит в UI-kit, а не в «Механиках».
//
// Главное свойство: пыль не самостоятельная картинка, а СМАЗ того, что под ней. Частицы рождаются
// по настоящему лицу и берут его цвета — туз пик размазывается тузом пик, джокер джокером. Раньше
// облако строилось по одному зашитому силуэту и красилось одним амбером, и цензура выглядела
// одинаковой жёлтой крошкой поверх чего угодно.
//
// Само лицо под пылью НЕ печатается: иначе видно и карту, и эффект сразу, и цензура перестаёт быть
// цензурой. Всё, что должно читаться, несут частицы.
//
// Смотреть надо В ДВИЖЕНИИ: пыль живёт, статичный кадр показывает лишь её срез.

type Target = "card" | "stack" | "chip" | "chess" | "zone";

interface Args {
  target: Target;
  card: string;
  custom: string;
  faceUp: boolean;
  censored: boolean;
  hidden: boolean;
  /** Размер частицы. Ниже — рычаги ОБЛАКА: те же поля, что крутит стенд `/motion` (censorConfig). */
  block: number;
  swapsPerSec: number;
  jitterAmp: number;
  jitterFreq: number;
  flicker: boolean;
}

const ARGS: Args = {
  target: "card",
  card: "A♠",
  custom: "",
  faceUp: true,
  censored: true,
  hidden: false,
  block: DANCE_DEFAULT.block,
  swapsPerSec: DANCE_DEFAULT.swapsPerSec,
  jitterAmp: DANCE_DEFAULT.jitterAmp,
  jitterFreq: DANCE_DEFAULT.jitterFreq,
  flicker: false,
};

// Рычаги облака действуют, только когда пыль вообще есть: без censored/hidden крутить нечего.
// (Storybook умеет одно условие, поэтому берём главный флаг — censored.)
const DUSTY = { arg: "censored", truthy: true } as const;

const ARG_TYPES = {
  target: {
    name: "target",
    description: "к какому элементу стола применяем цензуру: карта / стопка карт / фишка / шахматная фигура / дроп-зона",
    control: { type: "select" as const },
    options: ["card", "stack", "chip", "chess", "zone"] as Target[],
  },
  card: { name: "card", description: "значение карты; масть можно буквой S H D C («10H» = «10♥»)", control: { type: "text" as const } },
  custom: { name: "custom", description: "кастом-лицо из реестра CUSTOM_FACES; пусто — обычное лицо по рангу", control: { type: "select" as const }, options: ["", ...CUSTOM_FACE_IDS] },
  faceUp: { name: "faceUp", description: "лицом вверх. Рубашку пыль НЕ покрывает: прятать на ней нечего, обратная сторона публична", control: { type: "boolean" as const } },
  censored: { name: "censored", description: "ФИЛЬТР: настоящее лицо рисуется как есть, пыль ложится ПОВЕРХ него", control: { type: "boolean" as const } },
  hidden: { name: "hidden", description: "РЕЖИМ секретности: лицо ЗАМЕНЯЕТСЯ чистым фоном под пылью. Не путать с censored", control: { type: "boolean" as const } },
  block: { if: DUSTY, name: "dance.block", description: "размер частицы, px", control: { type: "range" as const, min: 2, max: 10, step: 1 } },
  swapsPerSec: { if: DUSTY, name: "dance.swapsPerSec", description: "темп обновления облака, раз в секунду", control: { type: "range" as const, min: 0, max: 120, step: 1 } },
  jitterAmp: { if: DUSTY, name: "dance.jitterAmp", description: "разлёт частиц", control: { type: "range" as const, min: 0, max: 4, step: 0.1 } },
  jitterFreq: { if: DUSTY, name: "dance.jitterFreq", description: "частота дрожания", control: { type: "range" as const, min: 0, max: 14, step: 0.1 } },
  flicker: { name: "flicker", description: "мерцание. Отдельный флаг фото-чувствительности: гасится «без вспышек»", control: { type: "boolean" as const } },
};

// Последние аргументы панели. Нужны потому, что живой сеттер получает ТОЛЬКО своё значение, а
// `setDustParams` принимает всю пятёрку разом: без общего снимка каждый ползунок затирал бы
// соседей значениями по умолчанию.
let live: Args = ARGS;
const liveIds: string[] = [];

/** Разослать текущие параметры облака по живым картам витрины. */
function pushDust(el: Card): void {
  const p = dustParams({ block: live.block, swapsPerSec: live.swapsPerSec, jitterAmp: live.jitterAmp, jitterFreq: live.jitterFreq }, live.flicker);
  el.setDustParams?.(p);
  for (const id of liveIds) (scene(el)?.(id) as Card | undefined)?.setDustParams?.(p);
}

/** Доступ к соседям по витрине через ту же карту — у стори своей ссылки на сцену нет. */
function scene(_el: Card): ((id: string) => unknown) | null {
  const g = globalThis as unknown as { __kit?: { scene?: { element(id: string): unknown } } };
  const s = g.__kit?.scene;
  return s ? (id: string) => s.element(id) : null;
}

const DUST_KEYS = ["block", "swapsPerSec", "jitterAmp", "jitterFreq", "flicker"] as const;

const meta: Meta<Args> = {
  title: "UI-kit/Censorship",
  parameters: {
    code: (a: Record<string, unknown>) => `// Цензура — свойство карты, а не отдельный объект.
ctx.card({ card: ${JSON.stringify(a.card)}, censored: ${JSON.stringify(a.censored)}, hidden: ${JSON.stringify(a.hidden)} }, { x: cx, y: cy });

// Переключается живьём, без пересборки:
c.setCensored(true);   // ФИЛЬТР: настоящее лицо на месте, пыль поверх него
c.setConcealed(true);  // РЕЖИМ секретности: лицо заменено чистым фоном под пылью

// Рычаги облака — общие со стендом /motion (game/censorConfig.ts), второго набора значений нет:
import { dustParams } from "../../game/censorConfig";
c.setDustParams(dustParams({ block: ${JSON.stringify(a.block)}, swapsPerSec: ${JSON.stringify(a.swapsPerSec)}, jitterAmp: ${JSON.stringify(a.jitterAmp)}, jitterFreq: ${JSON.stringify(a.jitterFreq)} }, ${JSON.stringify(a.flicker)}));`,
  },
  argTypes: ARG_TYPES,
  args: ARGS,
  // ОДНА карта. Ряда «шесть лиц парами» тут нет: сравнивать лица — работа боковой навигации, а в
  // ряду из шести ни на одном не разглядеть ни зерно, ни цвет — то самое, ради чего раздел заведён.
  render: (a) => (
    <CanvasStage<Card, Args>
      args={a}
      // Живьём — всё, что карта умеет переключить сама: пересобирать сцену ради ползунка значит
      // рождать карту заново, а рождение теперь ИГРАЕТ появление, и витрина мигала на каждый сдвиг.
      apply={{
        censored: (c, v) => c.setCensored(Boolean(v)),
        hidden: (c, v) => c.setConcealed(Boolean(v)),
        ...Object.fromEntries(DUST_KEYS.map((k) => [k, (c: Card) => pushDust(c)])),
      }}
      opts={{ cardHeight: 260 }}
      build={(ctx, args) => {
        live = args;
        liveIds.length = 0;
        const dust = dustParams({ block: args.block, swapsPerSec: args.swapsPerSec, jitterAmp: args.jitterAmp, jitterFreq: args.jitterFreq }, args.flicker);
        const cardOpts = { card: args.card, custom: args.custom, faceUp: args.faceUp, censored: args.censored, hidden: args.hidden, pose: "rest" as const };
        const mid = { x: ctx.padding + ctx.cardW / 2, y: ctx.padding + ctx.cardH / 2 };
        const tune = (ids: string[]) => ids.forEach((id) => (liveIds.push(id), (ctx.element(id) as Card | undefined)?.setDustParams?.(dust)));
        let w = ctx.cardW;
        let note = "";

        if (args.target === "card") {
          ctx.card({ ...cardOpts, id: "cens" }, mid);
          tune(["cens"]);
        } else if (args.target === "stack") {
          // Цензура — свойство КАЖДОЙ карты, а не стопки: у пачки своего лица нет. Поэтому
          // «зацензурить стопку» это зацензурить её карты, и видно, что верхняя прячет соседей
          // не хуже пыли — прятать надо всё равно каждую.
          const step = ctx.cardW * 0.55;
          const ids = ["s0", "s1", "s2", "s3"];
          ids.forEach((id, i) => ctx.card({ ...cardOpts, id }, { x: mid.x + i * step, y: mid.y }, i));
          tune(ids);
          w = ctx.cardW + step * (ids.length - 1);
        } else if (args.target === "chip" || args.target === "chess") {
          const r = ctx.cardH * 0.3;
          ctx.piece("p", { x: ctx.padding + r, y: ctx.padding + r }, args.target === "chip" ? { kind: "chip", color: 0xc79a3e, denom: "25" } : { kind: "chess", dark: true, glyph: "♞" }, r);
          w = r * 2;
          note = "фишка и фигура цензуру НЕ поддерживают: Concealable реализует только Card. Прятать у них нечего — они публичны по своей природе, значения не несут.";
        } else {
          note = "дроп-зона цензуру не поддерживает и не должна: это разметка стола, а не носитель информации. Скрывают КАРТЫ в ней, а не саму зону.";
        }

        if (note) {
          // Честный ответ вместо пустой витрины: «не поддерживается» — тоже факт о движке, и
          // выяснять его в игре хуже, чем прочитать здесь.
          const cap = ctx.label(note, ctx.padding, ctx.padding + (args.target === "zone" ? 0 : ctx.cardH * 0.7), 13, 0xcdb98f, ctx.cardW * 3, 0);
          ctx.extent(ctx.cardW * 3 + ctx.padding * 2, ctx.padding * 2 + cap.height + (args.target === "zone" ? 0 : ctx.cardH * 0.7));
          return;
        }
        ctx.extent(ctx.padding * 2 + w, ctx.padding * 2 + ctx.cardH);
      }}
    />
  ),
};
export default meta;

/**
 * Один элемент, всё остальное — рычаги. Страниц под туза, джокера и «фак» тут нет: их различает
 * ОДИН аргумент, и заводить под каждое значение свою страницу — то же, что заводить страницу под
 * каждый цвет кнопки.
 *
 * Главный рычаг — «на чём»: он отвечает на вопрос, что вообще можно зацензурить.
 *   • карта   — да, это её собственное свойство;
 *   • стопка  — да, но покарточно: у пачки своего лица нет, прятать надо каждую;
 *   • фишка, фигура — НЕТ. `Concealable` реализует только `Card`; им нечего прятать, значения они
 *     не несут и публичны по природе;
 *   • дроп-зона — НЕТ и не должна: это разметка стола, скрывают карты В ней, а не её саму.
 *
 * Ещё два места, где картинка обманывает:
 *   • `censored` против `hidden` — фильтр поверх настоящего лица против режима секретности, где
 *     лицо ЗАМЕНЕНО чистым фоном. Под пылью разницы не видно, в состоянии карты она принципиальная;
 *   • `faceUp: false` — рубашка пылью не покрывается: обратная сторона публична.
 */
export const Censorship: StoryObj<Args> = {};
