import { defineConfig } from "@playwright/test";

// E2E на канвасе: анимация/тени/графика и поведение движка в целом. Браузер — СИСТЕМНЫЙ Chrome
// (channel), поэтому загрузка chromium не нужна. Dev-сервер поднимается сам (reuse, если уже жив).
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    channel: "chrome",
    baseURL: "http://localhost:5174",
    viewport: { width: 500, height: 800 },
  },
  webServer: {
    command: "npx vite --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
