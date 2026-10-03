import { execSync } from "child_process";
import { defineConfig } from "vite";

// Номер сборки — число коммитов, как у сервера (`version.ts`): внизу настроек видно, что открыт свежий стенд.
const build = (() => { try { return execSync("git rev-list --count HEAD").toString().trim(); } catch { return "dev"; } })();

// ПЕСОЧНИЦА НА THREE.JS — свой порт. Код стола (`../server`) берётся исходниками: вне этой папки, поэтому
// `fs.allow` открывает корень репозитория.
export default defineConfig({
  define: { __TABLE_BUILD__: JSON.stringify(build) },
  build: { target: "esnext" },
  optimizeDeps: { esbuildOptions: { target: "esnext" } },
  server: {
    host: true,
    port: 9590,
    strictPort: true,
    // Телефон ходит по имени из tailnet (`scripts/dev-expose.sh`): без этого Vite отвечает 403 на чужой Host.
    allowedHosts: [".ts.net"],
    fs: { allow: [".."] },
  },
});
