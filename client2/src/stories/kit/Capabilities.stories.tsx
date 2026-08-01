import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from "pixi.js";
import { Card, type CardOptions } from "../../game/ui/Card";
import { PIXEL_FONT } from "../../game/engine/constants";
import { dropzonesSection } from "../../game/kit/dropzones";
import { CanvasStage } from "../harness/CanvasStage";

// ПРОВЕРОЧНЫЕ стори №2 и №3 (категории «способности элемента» и «механики сцены») — они здесь
// вместе, потому что это одно и то же явление с двух сторон: зона подсвечивается ТОЛЬКО под груз,
// который реально способен на её действие. Показать способности отдельно от механики значило бы
// показать список интерфейсов, а не поведение.
//
// Проверять — мышью. Скриншот, на котором «ничего не изменилось», одинаково выглядит и при
// работающем запрете, и при полностью неработающем драге (docs/HANDOFF.md).

interface Args {
  captions: boolean;
}

const CAPS: { id: string; cap: string; opts: CardOptions }[] = [
  { id: "cap-plain", cap: "обычная: тащится, переворачивается, горит", opts: { card: "A♠" } },
  { id: "cap-nodrag", cap: "Draggable=false: драг отбивается «стоп»-качанием", opts: { card: "2♥", draggable: false } },
  { id: "cap-noflip", cap: "Flippable=false: замок, ПЕРЕВОРОТ её не примет", opts: { card: "3♦", flippable: false } },
  { id: "cap-peek", cap: "Concealable+Peekable: скрыта, ПОДГЛЯДЕТЬ раскроет на время", opts: { card: "4♣", hidden: true } },
  { id: "cap-back", cap: "рубашкой вверх: тоже есть что подглядеть", opts: { card: "5♠", faceUp: false } },
];

const meta: Meta<Args> = {
  title: "Mechanics/Capabilities & drop zones",
  parameters: {
    code: () => `import type { Burnable, Flippable, Peekable } from "../../game/engine/element";

// Зона принимает груз по СПОСОБНОСТИ, а не по типу. Ни одного «если это карта» в движке нет —
// иначе каждый новый вид элемента требовал бы правки каждой зоны.
ctx.zone(
  new DropZone({ label: "ПЕРЕВОРОТ", rect }),
  (payload) => payload.els.forEach((el) => el.requestFlip()),
  (payload) => payload.els.every((el) => "requestFlip" in el),   // ← вот и весь фильтр
);

// Поэтому фишка ГОРИТ (Burnable), но не переворачивается (не Flippable), и зона это видит сама.`,
  },
  args: { captions: true },
  argTypes: { captions: { name: "captions", description: "подписи под картами", control: { type: "boolean" } } },
  render: (args) => (
    <CanvasStage<Card, Args>
      args={args}
      // Подписи меняют раскладку — только пересборкой; живого сеттера тут и не бывает.
      apply={{ captions: "rebuild" }}
      opts={{ cardHeight: 118 }}
      build={(ctx, a) => {
        const gap = 22;
        let x = ctx.padding;
        let hh = 0;
        for (const c of CAPS) {
          const card = new Card({ id: c.id, pose: "rest", ...c.opts }, ctx.tex, ctx.baseScale);
          hh = card.footprint.hh;
          ctx.add(card, { x: x + card.footprint.hw, y: ctx.padding + hh });
          if (a.captions) {
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

        // Зоны — НАСТОЯЩАЯ секция песочницы (game/kit/dropzones.ts), а не её местная копия.
        // Своих зон у стори быть не должно: копия разъедется с песочницей при первой же правке, и
        // каталог начнёт врать именно там, где ему верят больше всего.
        //
        // ВНИМАНИЕ, здесь ВИДЕН ДЕФЕКТ ДВИЖКА (issue #103): `asFlippable` определяет способность по
        // НАЛИЧИЮ метода requestFlip, который есть у любой карты, — флаг `flippable` в расчёт не
        // берётся. Поэтому груз всегда несёт `flip`, зона ПЕРЕВОРОТ подсвечивается даже под
        // «запертой» картой, а requestFlip() потом возвращает false и ничего не делает. Это ровно
        // то «зона обещает глаголом то, чего не сделает», от которого предостерегает весь остальной
        // код. В песочнице дефект не всплывал: там нет карты с flippable:false. Чинить его надо в
        // движке, и это решение владельца — поэтому каталог его ПОКАЗЫВАЕТ, а не прячет подписью.
        const zonesTop = ctx.padding + hh * 2 + (a.captions ? 74 : 30);
        const z = dropzonesSection(ctx, { x: ctx.padding, y: zonesTop });
        ctx.extent(Math.max(x, ctx.padding + z.width) + ctx.padding, z.bottom + ctx.padding);
      }}
    />
  ),
};
export default meta;

type Story = StoryObj<Args>;

/**
 * СПОСОБНОСТИ против ТИПОВ. Зона принимает груз не по тому, «карта это или фишка», а по тому, что
 * груз УМЕЕТ: «ПЕРЕВОРОТ» берёт Flippable, «ПОДГЛЯДЕТЬ» — Peekable, «СЖЕЧЬ» — Burnable. Поэтому
 * фишка горит, но не переворачивается, и ни одной проверки типа в движке для этого не нужно.
 *
 * Проверяется только мышью: перетащите каждый груз в каждую зону и посмотрите, какая загорится.
 * Тест «нелегальный дроп ничего не изменил» даёт тот же результат, что и полностью сломанный драг.
 */
export const Capabilities: Story = { name: "Capabilities" };
