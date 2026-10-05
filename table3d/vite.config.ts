import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { defineConfig, type Plugin } from "vite";

// Номер сборки — число коммитов, как у сервера (`version.ts`): внизу настроек видно, что открыт свежий стенд.
const build = (() => { try { return execSync("git rev-list --count HEAD").toString().trim(); } catch { return "dev"; } })();


// ЗАВОДСКИЕ ЗВУКИ И ВИБРАЦИИ ИЗ СТЕНДА: страница звуков (`design/zones/sounds-page.html`) кнопкой «Сделать заводским» шлёт сюда настройки действия, а мы дописываем их в
// `server/table-client/feelPreset.json` — тот же файл читает и стенд, и (по мере подключения) игра. Только для dev-сервера; всё, что пришло, чистится: известные поля, числа в пределах.
const PRESET_FILE = fileURLToPath(new URL("../server/table-client/feelPreset.json", import.meta.url));
const KINDS = ["grab", "carry", "lay", "throw", "slam", "flip", "spin", "deny", "home"];
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
const track = (v: unknown): string | null | undefined => (v === null ? null : typeof v === "string" && /^[a-z]+-\d$/.test(v) ? v : undefined);
function cleanVariant(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const t = track(raw.track); if (t !== undefined) out.track = t;
  for (const [k, lo, hi] of [["from", 0, 60000], ["end", 0, 60000], ["rate", 0.1, 4], ["pitch", -24, 24], ["vol", 0, 4], ["dyn", 0, 1]] as const) { const n = num(raw[k], lo, hi); if (n !== undefined) out[k] = n; }
  if (raw.from === null) out.from = null;
  if (typeof raw.tie === "boolean") out.tie = raw.tie;
  return out;
}
function cleanSpec(raw: Record<string, unknown>): Record<string, unknown> {
  const out = cleanVariant(raw);
  for (const [k, lo, hi] of [["gain", 0, 4], ["jitter", 0, 0.5], ["soft", 0, 1], ["cutMs", 0, 5000]] as const) { const n = num(raw[k], lo, hi); if (n !== undefined) out[k] = n; }
  if (typeof raw.synth === "boolean") out.synth = raw.synth;
  if (typeof raw.file === "string" && ["drop", "hand", "turn", "gather", "merge", "shuffle", "sort"].includes(raw.file)) out.file = raw.file; else if (raw.file === null) out.file = null;
  if (typeof raw.style === "string" && ["light", "medium", "heavy", "rigid", "soft", "selection", "success", "warning", "error"].includes(raw.style)) out.style = raw.style;
  if (Array.isArray(raw.vibe)) out.vibe = raw.vibe.filter((x) => typeof x === "number" && x >= 0 && x <= 1000).slice(0, 8);
  if (Array.isArray(raw.layers)) out.layers = raw.layers.slice(0, 6).map((l) => { const o = l as Record<string, unknown>; return { kind: ["boom", "tick", "noise"].includes(o.kind as string) ? o.kind : "tick", from: num(o.from, 20, 8000) ?? 100, ...(num(o.to, 20, 8000) !== undefined ? { to: num(o.to, 20, 8000) } : {}), ms: num(o.ms, 5, 1000) ?? 50, gain: num(o.gain, 0, 2) ?? 0.3, ...(num(o.q, 0.1, 20) !== undefined ? { q: num(o.q, 0.1, 20) } : {}) }; });
  if (Array.isArray(raw.extra)) out.extra = raw.extra.slice(0, 12).map((v) => cleanVariant(v as Record<string, unknown>));
  return out;
}
const feelPresetSaver = (): Plugin => ({
  name: "feel-preset-saver",
  configureServer(server) {
    server.middlewares.use("/__feel-preset", (req, res) => {
      if (req.method !== "POST") { res.statusCode = 405; res.end("POST only"); return; }
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 100_000) req.destroy(); });
      req.on("end", () => {
        try {
          const kinds = (JSON.parse(body) as { kinds?: Record<string, Record<string, unknown>> }).kinds ?? {};
          const file = JSON.parse(readFileSync(PRESET_FILE, "utf8")) as Record<string, unknown>, saved: string[] = [];
          for (const k of KINDS) if (kinds[k] && typeof kinds[k] === "object") { file[k] = cleanSpec(kinds[k]!); saved.push(k); }
          writeFileSync(PRESET_FILE, JSON.stringify(file, null, 2) + "\n");
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true, saved }));
        } catch (e) { res.statusCode = 400; res.end(String((e as Error).message)); }
      });
    });
  },
});

// ПЕСОЧНИЦА НА THREE.JS — свой порт. Код стола (`../server`) берётся исходниками: вне этой папки, поэтому
// `fs.allow` открывает корень репозитория.
export default defineConfig({
  plugins: [feelPresetSaver()],
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
