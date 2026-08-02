import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Card } from "../../game/ui/Card";
import { shadowScene } from "../../game/kit/shadowScene";
import { resolvePreset } from "../../game/anim/presets";
import { SHADOW_TUNING } from "../../game/ui/shadow";
import type { Pose } from "../../game/ui/Card";
import type { KitScene } from "../../game/engine/kitScene";
import { CanvasStage } from "../harness/CanvasStage";
import { gallerySection, type GalleryCell } from "../../game/kit/gallery";
import { stackState } from "../../game/kit/stacks";
import { Button } from "../../game/ui/Button";



interface Args {
  crossLevel: boolean;
  withButton: boolean;
  profile: "full" | "reduced";
  subject: "card" | "chip" | "chess" | "mixed";
  pose: Pose;
  compare: boolean;
  overlap: number;
  base: number;
  growth: number;
  dx: number;
  dxLift: number;
  dy: number;
  dyLift: number;
  attach: "element" | "table";
}

/**
 * ТЕНИ. Стол плоский, и вся его объёмность держится на двух вещах:
 *
 *  1. ПЛАН (rest / lifted / held) — он же СЛОЙ отрисовки. Лежащие карты рисуются ниже поднятых,
 *     поднятые — ниже тех, что в руке. Слой выводится из плана (`levelOf`), а не ставится руками,
 *     поэтому поднятая карта не может случайно оказаться под лежащей.
 *  2. ТЕНЬ — единственный ответ на вопрос «как высоко». Дальше и крупнее = выше. Других сигналов
 *     высоты у плоской картинки нет.
 *
 * Тени всех предметов ОДНОГО слоя сливаются в ОДНУ маску и заливаются одним цветом. Это не
 * оптимизация: рисуй каждый свою — в пересечениях они складывались бы и темнели, и две лежащие
 * рядом карты выглядели бы так, будто между ними дыра. Отсюда же следует, что размыть край
 * нечем — маска общая.
 */
const meta: Meta<Args> = {
  title: "UI-kit/Shadow",
  args: { crossLevel: false, withButton: false, profile: "full", subject: "card", pose: "rest", compare: true, overlap: 3, ...SHADOW_TUNING },
  argTypes: {
    crossLevel: {
      name: "crossLevel",
      description: "положить удерживаемую карту поверх лежащей. Тени разложены по СЛОЯМ: тень верхней ложится НА нижнюю карту, а не прячется под ней — между слоями они не сливаются",
      control: { type: "boolean" },
    },
    withButton: {
      name: "withButton",
      description: "добавить кнопку. У неё тень СВОЯ, вне общего пасса: кнопка — интерфейс поверх стола, и в общей маске она затемняла бы карты под собой",
      control: { type: "boolean" },
    },
    profile: {
      name: "profile",
      description:
        "тир качества (issue #8). full — всё как задумано. reduced — движок сам переходит на него при просадке FPS ниже 45: теневой пасс ГАСНЕТ ЦЕЛИКОМ, idle-анимации замирают. Тени пропали — это заявленное поведение на слабом железе, а не поломка. Тень кнопки при этом остаётся: она не в пассе",
      control: { type: "select" },
      options: ["full", "reduced"],
    },
    subject: {
      name: "subject",
      description: "на чём: card — прямоугольный силуэт; chip — эллипс лежащей фишки; chess — узкий овал у основания стоящей фигуры; mixed — все вместе, чтобы видеть, что силуэт следует ФОРМЕ предмета",
      control: { type: "select" },
      options: ["card", "chip", "chess", "mixed"],
    },
    compare: { name: "compare", description: "показать три плана рядом. Высоту читают СРАВНЕНИЕМ: одна тень сама по себе ничего не сообщает", control: { type: "boolean" } },
    pose: { name: "pose", description: "поза покоя = слой отрисовки = высота", control: { type: "select" }, options: ["rest", "lifted", "held"], if: { arg: "compare", truthy: false } },
    overlap: { name: "overlap", description: "сколько карт внахлёст. На перекрытии видно, что тени СЛИВАЮТСЯ, а не темнят друг друга", control: { type: "range", min: 1, max: 6, step: 1 } },
    base: { name: "shadow.base", description: "размер тени у ЛЕЖАЩЕГО предмета, в долях его размера. 1 — ровно по нему; больше — тень торчит из-под карты со всех сторон", control: { type: "range", min: 0.8, max: 1.4, step: 0.01 } },
    growth: { name: "shadow.growth", description: "насколько тень крупнее с высотой. ОСМЫСЛЕННО ТОЛЬКО при follow≈0: у тени, лежащей на столе, пятно растёт, потому что источник близкий. У приклеенной (follow=1) размер меняться не должен — она едет с предметом, и рост читается как «живёт отдельно»", control: { type: "range", min: 0, max: 1, step: 0.01 } },
    dx: { name: "shadow.dx", description: "смещение влево у лежащего, в долях высоты карты", control: { type: "range", min: 0, max: 0.2, step: 0.005 } },
    dxLift: { name: "shadow.dxLift", description: "добавка влево с высотой", control: { type: "range", min: 0, max: 1, step: 0.02 } },
    dy: { name: "shadow.dy", description: "смещение вниз у лежащего", control: { type: "range", min: 0, max: 0.2, step: 0.005 } },
    attach: {
      name: "shadow.attach",
      description: "к чему привязана тень. element — приклеена к предмету: едет с ним, размер постоянный, высоту читаем по зазору. table — лежит на столе: предмет уходит вверх, пятно остаётся, отдаляется и растёт. Это разные источники света, промежуточного не бывает",
      control: { type: "select" },
      options: ["element", "table"],
    },
    dyLift: { name: "shadow.dyLift", description: "добавка вниз с высотой. Свет сверху справа, поэтому вниз тень уходит сильнее, чем вбок", control: { type: "range", min: 0, max: 2, step: 0.02 } },
  },
  parameters: {
    code: (a: Record<string, unknown>) => `import { resolvePreset } from "../../game/anim/presets";

// Модель тени — часть ФИЛА, как и анимации: её вешают на элементы, а не на сцену.
ctx.setAnimPreset(ids, resolvePreset({
  shadow: {
    base: ${a.base},        // размер у лежащего: 1 — ровно по предмету
    growth: ${a.growth},    // насколько крупнее с высотой
    attach: ${JSON.stringify(a.attach)},   // element — приклеена к предмету, table — лежит на столе
    dx: ${a.dx}, dxLift: ${a.dxLift},   // влево: у лежащего и добавка с высотой
    dy: ${a.dy}, dyLift: ${a.dyLift},   // вниз (свет сверху справа — вниз сильнее)
  },
}));

// Высота задаётся ПЛАНОМ, а не тенью: тень лишь показывает её.
ctx.card({ id, card: "A♠", pose: "lifted" }, { x, y });`,
  },
  render: (a) => (
    <CanvasStage<Card, Args>
      args={a}
      opts={{ cardHeight: 150 }}
      onScene={(scene: KitScene, args: Args) => scene.setProfile(args.profile)}
      build={(ctx, args) => {
        const preset = resolvePreset({ shadow: { base: args.base, growth: args.growth, dx: args.dx, dxLift: args.dxLift, dy: args.dy, dyLift: args.dyLift, attach: args.attach } });
        const r = shadowScene(ctx, { x: ctx.padding, y: ctx.padding }, { pose: args.pose, compare: args.compare, overlap: args.overlap, preset, subject: args.subject, crossLevel: args.crossLevel, withButton: args.withButton });
        ctx.extent(r.width + ctx.padding * 2, r.bottom + ctx.padding);
      }}
    />
  ),
};
export default meta;

/**
 * Тени и высота. По умолчанию — три плана рядом: высоту читают сравнением.
 *
 * Что стоит покрутить, потому что по одной картинке этого не понять:
 *   • `overlap` — тени накладываются и НЕ темнеют. Они сливаются в одну маску; иначе между двумя
 *     лежащими картами читалась бы тёмная щель;
 *   • `shadow.base: 1.1` — тень становится больше карты, и лежащая карта начинает «парить». Именно
 *     так и было, пока в базе стоял множитель 1.06 «ради мягкого края»;
 *   • `growth: 0` — все три плана получат тень одного размера, и высота перестанет читаться совсем,
 *     хотя слои отрисовки останутся прежними. Это и показывает, что объём несёт ТЕНЬ, а не порядок.
 */
export const Shadow: StoryObj<Args> = {};

/**
 * ГАЛЕРЕЯ ТЕНЕЙ — предметы разной формы рядом, у каждого своя.
 *
 * Здесь видно то, чего не видно на одной витрине: тень не «карточный прямоугольник, натянутый на
 * всё». У лежащей фишки это её круг, у стоящей фигуры — её собственная картинка, у карты —
 * скруглённый прямоугольник её пластины. Форма приходит от ПРЕДМЕТА, а закон (смещение, рост с
 * высотой, свет) — общий, и рядом это единственное, чем проверяется.
 *
 * Кнопка тут не для полноты: у неё тень СВОЯ, вне общего слитого пасса — попади её силуэт в общую
 * маску, она затемняла бы карты под собой.
 */
export const Gallery: StoryObj<Args> = {
  parameters: {
    controls: { disable: true },
    code: () => `import { gallerySection } from "../../game/kit/gallery";

// Виды — ДАННЫЕ: что нарисовать в ячейке и как подписать. Раскладка общая для всех галерей.
gallerySection(ctx, at, [
  { caption: "карта", w: ctx.cardW, h: ctx.cardH, draw: (c, p, i) => c.card({ id: \`g-\${i}\`, card: "A♠" }, p) },
  { caption: "фишка", w: r * 2, h: r * 2, draw: (c, p, i) => c.piece(\`g-\${i}\`, p, { kind: "chip", color: 0xc79a3e, denom: "25" }, r) },
  // …фигура, стопка, кнопка
]);`,
  },
  render: () => (
    <CanvasStage<Card, Record<string, never>>
      args={{}}
      opts={{ cardHeight: 130 }}
      build={(ctx) => {
        const r = ctx.cardH * 0.28;
        const cells: GalleryCell[] = [
          { caption: "карта лежит", w: ctx.cardW, h: ctx.cardH, draw: (c, p, i) => c.card({ id: `sg-${i}`, card: "A♠" }, p, i) },
          { caption: "карта поднята", w: ctx.cardW * 1.2, h: ctx.cardH * 1.2, draw: (c, p, i) => c.card({ id: `sg-${i}`, card: "K♥", pose: "lifted" }, p, i) },
          { caption: "карту держат", w: ctx.cardW * 1.45, h: ctx.cardH * 1.45, draw: (c, p, i) => c.card({ id: `sg-${i}`, card: "Q♦", pose: "held" }, p, i) },
          { caption: "стопка: тени сливаются", w: ctx.cardW * 1.9, h: ctx.cardH, draw: (c, p, i) => stackState(c, { x: p.x - ctx.cardW * 0.95, y: p.y - ctx.cardH / 2 }, { form: "spread", count: 3 }, `sgs-${i}`) },
          { caption: "фишка лежит: круг", w: r * 2, h: r * 2, draw: (c, p, i) => c.piece(`sg-${i}`, p, { kind: "chip", color: 0xc79a3e, denom: "25" }, r) },
          { caption: "фигура стоит: своя форма", w: r * 2, h: r * 2, draw: (c, p, i) => c.piece(`sg-${i}`, p, { kind: "chess", dark: true, glyph: "♞" }, r) },
          { caption: "кнопка: тень вне общего пасса", w: 150, h: 46, draw: (c, p) => c.button(new Button({ label: "своя тень", variant: "primary", size: "md", elevation: 12 }), p) },
        ];
        const g = gallerySection(ctx, { x: ctx.padding, y: ctx.padding }, cells);
        ctx.extent(g.width + ctx.padding * 2, g.bottom + ctx.padding);
      }}
    />
  ),
};
