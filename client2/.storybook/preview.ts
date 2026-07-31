import type { Preview } from "@storybook/react-vite";

// Глобального декоратора тут НЕТ намеренно: канвас поднимает сам стори через CanvasStage.
// Глобальный декоратор навязал бы канвас и тем стори, которым он не нужен (чистые мапперы,
// будущие MDX-страницы), и держал бы WebGL-контекст занятым без дела.
const preview: Preview = {
  parameters: {
    // Компоненты рисуются во всю площадь канваса — рамка Storybook только мешает мерить.
    layout: "fullscreen",
    controls: { expanded: true, matchers: { color: /(background|color)$/i } },
    // Цвет сукна из theme.css (.table-screen). На белом фоне карты и тени читаются неверно:
    // тень у нас не чёрная, а «тёмная в тон стола» (SHADOW_COLOR), и вне стола выглядит грязью.
    backgrounds: {
      options: {
        table: { name: "стол", value: "#2f3d34" },
        dark: { name: "тёмный", value: "#12181a" },
      },
    },
  },
  initialGlobals: { backgrounds: { value: "table" } },
};

export default preview;
