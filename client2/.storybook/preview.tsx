import type { Preview } from "@storybook/react-vite";
import { addons, useEffect } from "storybook/preview-api";
import { DocsPage } from "./DocsPage";
// Арифметика таблицы рычагов живёт в src — она чистая и проверяется юнитом (argTable.test.ts).
import { fillDefaults, fillTypes } from "../src/stories/harness/argTable";
// Что печатает «Show code» — тоже чистая функция и тоже в src, рядом с тестом (storySource.ts).
import { sourceFor } from "../src/stories/harness/storySource";

/** Канал «превью → менеджер» для панели «Код». Имя одно на обе стороны (см. .storybook/manager.tsx). */
export const CODE_EVENT = "crusade/code";

// Глобального декоратора тут НЕТ намеренно: канвас поднимает сам стори через CanvasStage.
// Глобальный декоратор навязал бы канвас и тем стори, которым он не нужен (чистые мапперы,
// будущие MDX-страницы), и держал бы WebGL-контекст занятым без дела.
/**
 * Отдать панели «Код» готовый текст.
 *
 * Считает его ПРЕВЬЮ, а не панель, и это не выбор: `parameters.code` — функция, а функции не
 * переживают канал между превью и менеджером (туда уходит только сериализуемое). Панель, которая
 * пыталась звать её у себя, честно сообщала «параметр не описан» — при том что он описан.
 */
const withCode: Preview["decorators"] = [
  (Story, ctx) => {
    const make = ctx.parameters?.code as ((a: Record<string, unknown>) => string) | undefined;
    useEffect(() => {
      // useEffect берётся из preview-api, а не из React: декоратор — не компонент, и реактовский
      // хук там не срабатывает молча (панель оставалась пустой при описанном параметре).
      addons.getChannel().emit(CODE_EVENT, make ? make(ctx.args as Record<string, unknown>) : null);
    }, [make, JSON.stringify(ctx.args)]);
    return Story();
  },
];

const preview: Preview = {
  decorators: withCode,
  parameters: {
    // Компоненты рисуются во всю площадь канваса — рамка Storybook только мешает мерить.
    layout: "fullscreen",
    controls: { expanded: true, matchers: { color: /(background|color)$/i } },
    // source.type: "code" — печатать ИСХОДНИК стори, а не пересказ. Дефолт («dynamic») показывает
    // отрендеренный JSX, и функции в нём схлопываются до `build={() => {}}`: у наших стори весь
    // смысл именно в теле build, так что пересказ выходил пустым по содержанию. (#106, п.1)
    docs: { page: DocsPage, source: { type: "code", transform: sourceFor } },
    // Цвет сукна из theme.css (.table-screen). На белом фоне карты и тени читаются неверно:
    // тень у нас не чёрная, а «тёмная в тон стола» (SHADOW_COLOR), и вне стола выглядит грязью.
    backgrounds: {
      options: {
        // Дефолт — «прозрачно»: шахматка из preview-head.html проступает сквозь неё, и КРОМКА
        // КАНВАСА становится видна. Сам канвас своё сукно рисует сам (CanvasStage), так что
        // компонент по-прежнему стоит на том фоне, на котором стоит в игре.
        transparent: { name: "прозрачно (шахматка)", value: "transparent" },
        table: { name: "стол", value: "#2f3d34" },
        dark: { name: "тёмный", value: "#12181a" },
      },
    },
  },
  // Вкладка Docs включена ВСЕМ разделам — ради исходников стори (владелец: «непонятно, как
  // написана та или иная стори»). Штатная страница нам не годится: её <Stories/> монтирует каждую
  // стори живым канвасом, а канвас у нас один на весь сторибук. Своя страница (DocsPage.tsx)
  // показывает один живой пример и код ВСЕХ стори — контекст остаётся один.
  tags: ["autodocs"],

  argTypesEnhancers: [fillDefaults, fillTypes],

  initialGlobals: { backgrounds: { value: "transparent" } },
};

export default preview;
