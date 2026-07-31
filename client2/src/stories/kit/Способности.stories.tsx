import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from "pixi.js";
import { Card, type CardOptions } from "../../game/ui/Card";
import { DropZone } from "../../game/ui/DropZone";
import { PIXEL_FONT } from "../../game/engine/constants";
import { CanvasStage } from "../harness/CanvasStage";

// ПРОВЕРОЧНЫЕ стори №2 и №3 (категории «способности элемента» и «механики сцены») — они здесь
// вместе, потому что это одно и то же явление с двух сторон: зона подсвечивается ТОЛЬКО под груз,
// который реально способен на её действие. Показать способности отдельно от механики значило бы
// показать список интерфейсов, а не поведение.
//
// Проверять — мышью. Скриншот, на котором «ничего не изменилось», одинаково выглядит и при
// работающем запрете, и при полностью неработающем драге (docs/HANDOFF.md).

interface Args {
  подсказки: boolean;
}

const CAPS: { id: string; cap: string; opts: CardOptions }[] = [
  { id: "cap-plain", cap: "обычная: тащится, переворачивается, горит", opts: { card: "A♠" } },
  { id: "cap-nodrag", cap: "Draggable=false: драг отбивается «стоп»-качанием", opts: { card: "2♥", draggable: false } },
  { id: "cap-noflip", cap: "Flippable=false: замок, ПЕРЕВОРОТ её не примет", opts: { card: "3♦", flippable: false } },
  { id: "cap-peek", cap: "Concealable+Peekable: скрыта, ПОДГЛЯДЕТЬ раскроет на время", opts: { card: "4♣", hidden: true } },
  { id: "cap-back", cap: "рубашкой вверх: тоже есть что подглядеть", opts: { card: "5♠", faceUp: false } },
];

const meta: Meta<Args> = {
  title: "Механики/Способности и дроп-зоны",
  args: { подсказки: true },
  argTypes: { подсказки: { name: "подписи под картами", control: { type: "boolean" } } },
  render: (args) => (
    <CanvasStage<Card, Args>
      args={args}
      // Подписи меняют раскладку — только пересборкой; живого сеттера тут и не бывает.
      apply={{ подсказки: "rebuild" }}
      opts={{ cardHeight: 118 }}
      build={(ctx, a) => {
        const gap = 22;
        let x = ctx.padding;
        let hh = 0;
        for (const c of CAPS) {
          const card = new Card({ id: c.id, rest: "idle", ...c.opts }, ctx.tex, ctx.baseScale);
          hh = card.footprint.hh;
          ctx.add(card, { x: x + card.footprint.hw, y: ctx.padding + hh });
          if (a.подсказки) {
            const t = new Text({
              text: c.cap,
              style: { fontFamily: PIXEL_FONT, fontSize: 13, fill: 0xcdb98f, wordWrap: true, wordWrapWidth: card.footprint.hw * 2 + gap },
            });
            t.anchor.set(0.5, 0);
            t.position.set(x + card.footprint.hw, ctx.padding + hh * 2 + 10);
            ctx.decor(t);
          }
          x += card.footprint.hw * 2 + gap;
        }

        // Зоны — ровно те же три, что в песочнице, с теми же способностями груза. Приём идёт по
        // СПОСОБНОСТИ (accepts), а не по типу элемента: зона обещает глаголом только то, что после
        // отпускания реально сделает.
        const zw = 190;
        const zh = zw * (9 / 16);
        const zy = ctx.padding + hh * 2 + (a.подсказки ? 74 : 30);
        let zx = ctx.padding;
        // НАЙДЕНО ЭТИМ КАТАЛОГОМ (поведение движка, не стори): `asFlippable` определяет способность
        // по НАЛИЧИЮ метода requestFlip, который есть у любой карты — флаг `flippable` в расчёт не
        // берётся. Поэтому груз всегда несёт `flip`, зона его принимает и подсвечивается, а
        // requestFlip() потом возвращает false и ничего не делает. В песочнице это не всплывало:
        // там нет карты с flippable:false. Чинить надо в движке (капабилити должна читать флаг),
        // и это решение владельца (issue #103); пока — говорим правду подписью, а не молчим.
        ctx.zone(
          new DropZone({ name: "ПЕРЕВОРОТ", verb: "перевернуть", armed: "перевернуть?", rect: { x: zx, y: zy, w: zw, h: zh } }),
          (p) => p.flip?.(),
          (p) => !!p.flip,
          (p) =>
            "flippable" in p.lead && !(p.lead as unknown as { flippable: boolean }).flippable
              ? { armed: "она заперта", hot: "не переворачивается." }
              : { armed: "перевернуть?", hot: "перевернуть" },
        );
        zx += zw + gap;
        ctx.zone(new DropZone({ name: "СЖЕЧЬ", verb: "сжечь", rect: { x: zx, y: zy, w: zw, h: zh } }), (p) => p.burn?.(), (p) => !!p.burn);
        zx += zw + gap;
        ctx.zone(
          new DropZone({ name: "ПОДГЛЯДЕТЬ", verb: "Отпускай!", armed: "давай подсмотрим?", rect: { x: zx, y: zy, w: zw, h: zh } }),
          (p) => p.peek?.(),
          (p) => !!p.peek,
          // Способность «подглядеть» есть у любой карты, а вот РАСКРЫВАТЬ бывает нечего: у
          // открытой карты canPeek === false. Без этой развилки зона звала бы подсмотреть туда,
          // где уже всё видно — то самое «зона обещает глаголом то, чего не сделает».
          (p) =>
            "canPeek" in p.lead && (p.lead as unknown as { canPeek: boolean }).canPeek
              ? { armed: "давай подсмотрим?", hot: "Отпускай!" }
              : { armed: "зачем?", hot: "нет." },
        );
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<Args>;

/** Пять карт с разными способностями и три зоны. Тащите карту к зоне — подсветится только та,
 *  что реально примет груз. «Стоп»-качание у недрагабельной видно только мышью. */
export const Обзор: Story = {};

/** Без подписей — так витрину удобно рассматривать и снимать. */
export const БезПодписей: Story = { args: { подсказки: false } };
