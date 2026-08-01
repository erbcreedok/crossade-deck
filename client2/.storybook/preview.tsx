import type { Preview } from "@storybook/react-vite";
import { addons, useEffect } from "storybook/preview-api";
import { DocsPage } from "./DocsPage";
// Арифметика таблицы рычагов живёт в src — она чистая и проверяется юнитом (argTable.test.ts).
import { fillDefaults, fillTypes } from "../src/stories/harness/argTable";

/** Канал «превью → менеджер» для панели «Код». Имя одно на обе стороны (см. .storybook/manager.tsx). */
export const CODE_EVENT = "crusade/code";

// Глобального декоратора тут НЕТ намеренно: канвас поднимает сам стори через CanvasStage.
// Глобальный декоратор навязал бы канвас и тем стори, которым он не нужен (чистые мапперы,
// будущие MDX-страницы), и держал бы WebGL-контекст занятым без дела.
/**
 * Что печатать в «Show code».
 *
 * Раздел устроен как ОДНА витрина с аргументами: `render` живёт в `meta`, а стори — это набор
 * значений. Своего кода у такой стори нет вовсе, и Storybook честно печатал пустое `{}` — блок
 * выглядел сломанным, хотя ломаться в нём нечему.
 *
 * Печатаем то, чем стори на самом деле является: её аргументы. Полный код витрины (общий `render`
 * из `meta`) лежит на вкладке Docs — в блоке «Весь файл раздела целиком», и дублировать его под
 * каждой стори значило бы девять раз повторить одно и то же.
 */
interface SourceCtx {
  name?: string;
  args?: Record<string, unknown>;
  initialArgs?: Record<string, unknown>;
  parameters?: { code?: (args: Record<string, unknown>) => string };
}

/**
 * Что печатать в «Show code».
 *
 * Смотрящий уже поднял движок; ему нужен код, который ВОСПРОИЗВЕДЁТ ЭТУ КАРТИНКУ. Ни исходник
 * стори, ни его пересказ на этот вопрос не отвечают: стори — это React, контролы и общий пул
 * канвасов, то есть устройство КАТАЛОГА, а не применение компонента. Раньше тут печаталось
 * `{ args: { … } }` — фрагмент, который никуда не скопируешь.
 *
 * Поэтому раздел один раз описывает, как из аргументов собирается код компонента
 * (`parameters.code`), а мы зовём это с аргументами КОНКРЕТНОЙ стори. Разъехаться с компонентом
 * такой код не может: аргументы те же, что крутятся в панели.
 */
function sourceFor(code: string, ctx: SourceCtx): string {
  const args = ctx.args ?? ctx.initialArgs ?? {};
  const make = ctx.parameters?.code;
  if (make) return make(args);
  // Раздел свой шаблон не описал — печатаем хотя бы аргументы, но честно говорим, что это не
  // код компонента. Молча показывать `{}` хуже: блок выглядит сломанным.
  const body = Object.entries(args)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`)
    .join("\n");
  const own = code.trim();
  if (!body) return own && own !== "{}" ? code : "// У раздела не описан parameters.code — показывать нечего.";
  return `// Аргументы этой стори. Кода компонента у раздела не описано (parameters.code).\n{\n${body}\n}`;
}

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
