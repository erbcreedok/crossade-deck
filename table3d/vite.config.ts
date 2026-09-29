import { defineConfig } from "vite";

// ПЕСОЧНИЦА НА THREE.JS — свой порт. Код стола (`../server`) берётся исходниками: вне этой папки, поэтому
// `fs.allow` открывает корень репозитория.
export default defineConfig({
  build: { target: "esnext" },
  optimizeDeps: { esbuildOptions: { target: "esnext" } },
  server: {
    host: true,
    port: 9590,
    strictPort: true,
    fs: { allow: [".."] },
  },
});
