import type { StorybookConfig } from "@storybook/react-vite";

// Сторибук канвасного UI-kit. Правило проекта «HTML в приложении быть не должно» тут НЕ нарушено:
// Storybook — dev-стенд, такое же сознательное исключение, как /no-ui и скроллбары песочницы
// (см. docs/HANDOFF.md). Условие, которое это исключение удерживает: стори поднимают НАСТОЯЩИЕ
// Pixi-компоненты через общий канвас-хост, HTML-макетов компонентов быть не может.
const config: StorybookConfig = {
  stories: ["../src/stories/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: { name: "@storybook/react-vite", options: {} },
  staticDirs: ["../public"],

  // Докген вытаскивает пропсы РЕАКТ-компонентов. У нас компоненты — классы Pixi, про которые он
  // всё равно ничего не знает, а время сборки жжёт на каждом файле. Контролы приходят из
  // src/stories/kit (см. cardArgs.ts), а не из докгена.
  typescript: { reactDocgen: false },

  // ВАЖНО: autodocs НЕ включаем. Docs-страница монтирует все стори раздела разом, а канвас у нас
  // ОДИН на iframe и переиспользуется между стори — в N блоков одновременно он не поместится.
  // Вернёмся к докам, когда у стенда появится режим «оживить по клику».
  docs: { defaultName: "Docs" },

  viteFinal: async (cfg) => ({
    ...cfg,
    // vite.config.ts в production-режиме ставит base: "/v2/" (клиент раздаётся сабрутом). Для
    // build-storybook это дало бы битые пути к ассетам — статика лежит рядом с собой.
    base: "./",
    // ...и там же server.port: 5174. Без сброса сторибук отобрал бы порт у dev-сервера и у
    // Playwright (в его конфиге reuseExistingServer на том же 5174).
    server: { ...cfg.server, port: undefined, strictPort: false, host: false },
    // Плагин инжектит номер сборки в index.html приложения; у сторибука свой хост-документ.
    plugins: (cfg.plugins ?? []).filter((p) => (p as { name?: string } | null)?.name !== "live-build-info"),
  }),
};

export default config;
