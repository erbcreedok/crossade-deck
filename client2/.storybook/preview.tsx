import type { Preview } from "@storybook/react-vite";
import { DocsPage } from "./DocsPage";

// Глобального декоратора тут НЕТ намеренно: канвас поднимает сам стори через CanvasStage.
// Глобальный декоратор навязал бы канвас и тем стори, которым он не нужен (чистые мапперы,
// будущие MDX-страницы), и держал бы WebGL-контекст занятым без дела.
const preview: Preview = {
  parameters: {
    // Компоненты рисуются во всю площадь канваса — рамка Storybook только мешает мерить.
    layout: "fullscreen",
    controls: { expanded: true, matchers: { color: /(background|color)$/i } },
    docs: { page: DocsPage },
    // Цвет сукна из theme.css (.table-screen). На белом фоне карты и тени читаются неверно:
    // тень у нас не чёрная, а «тёмная в тон стола» (SHADOW_COLOR), и вне стола выглядит грязью.
    backgrounds: {
      options: {
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

  initialGlobals: { backgrounds: { value: "table" } },
};

export default preview;
