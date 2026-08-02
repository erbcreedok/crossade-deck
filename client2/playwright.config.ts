import { defineConfig } from "@playwright/test";

// E2E на канвасе: анимация/тени/графика и поведение движка в целом. Браузер — СИСТЕМНЫЙ Chrome
// (channel), поэтому загрузка chromium не нужна. Серверы поднимаются сами (reuse, если уже живы).
//
// ДВА проекта, потому что сцен две и живут они по разным адресам:
//   app     — песочница и стол приложения (vite, 5174);
//   catalog — витрины каталога (Storybook, 6006). Их движок (KitScene) владеет Application, и то,
//             что он делает с ЖИВОЙ сценой — дом элемента после перемещения, глубина по прилёту,
//             дроп по координате пальца, — в node не проверить: там нет ни WebGL, ни тикера. Здесь
//             же это ровно то, что видит человек.
export default defineConfig({
  testDir: "e2e",
  // Имя проекта в путь снимков НЕ входит: эталоны сняты до того, как проектов стало два, и
  // подставлять его значило бы объявить все существующие снимки несуществующими.
  snapshotPathTemplate: "{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-snapshotSuffix}{ext}",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    channel: "chrome",
    viewport: { width: 500, height: 800 },
  },
  projects: [
    {
      name: "app",
      testMatch: "**/*.spec.ts",
      testIgnore: "**/catalog/**",
      use: { baseURL: "http://localhost:5174" },
    },
    {
      name: "catalog",
      testMatch: "**/catalog/*.spec.ts",
      use: { baseURL: "http://localhost:6006" },
    },
  ],
  webServer: [
    {
      command: "npx vite --port 5174 --strictPort",
      url: "http://localhost:5174",
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: "npx storybook dev -p 6006 --no-open --quiet",
      url: "http://localhost:6006",
      reuseExistingServer: true,
      timeout: 180000,
    },
  ],
});
