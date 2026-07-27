// Собирает из atoms-map.md самодостаточный HTML (marked + mermaid с CDN), пригодный для
// печати в PDF через Chrome headless. Кириллица-safe шрифт, перенос длинных строк кода/таблиц
// (чтобы на телефоне ничего не убегало за край). Запуск: node scripts/md-to-pdf.mjs <in.md> <out.html>
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
const md = readFileSync(inPath, "utf8");

// В md нет подстроки "</script>", поэтому кладём его как есть в <script type="text/plain">.
const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Карта атомов — client2</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>
  :root { --ink:#1a1f1c; --muted:#5a6b60; --line:#d7ddd6; --code-bg:#f4f6f3; --accent:#2f6b34; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif;
    color: var(--ink); line-height: 1.5; margin: 0 auto; max-width: 900px;
    padding: 24px 20px 60px; font-size: 14px;
  }
  h1 { font-size: 26px; border-bottom: 3px solid var(--accent); padding-bottom: 6px; }
  h2 { font-size: 21px; margin-top: 34px; border-bottom: 1px solid var(--line); padding-bottom: 4px; }
  h3 { font-size: 17px; margin-top: 26px; color: var(--accent); }
  h4 { font-size: 15px; margin-top: 18px; }
  p, li { overflow-wrap: anywhere; }
  a { color: var(--accent); }
  blockquote {
    margin: 12px 0; padding: 8px 14px; border-left: 4px solid #e0b84a;
    background: #fbf6e7; border-radius: 4px; color: #4a4230;
  }
  blockquote p { margin: 4px 0; }
  code {
    font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
    background: var(--code-bg); padding: 1px 5px; border-radius: 4px; font-size: 12px;
  }
  pre {
    background: var(--code-bg); border: 1px solid var(--line); border-radius: 8px;
    padding: 12px 14px; overflow-x: auto; page-break-inside: avoid;
  }
  pre code { background: none; padding: 0; font-size: 11.5px; line-height: 1.45;
    white-space: pre-wrap; overflow-wrap: anywhere; }
  table {
    border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 11.5px;
    page-break-inside: avoid; table-layout: fixed;
  }
  th, td { border: 1px solid var(--line); padding: 5px 7px; text-align: left;
    vertical-align: top; overflow-wrap: anywhere; }
  th { background: #eef2ec; }
  td code, th code { font-size: 10.5px; }
  details { margin: 8px 0; border: 1px solid var(--line); border-radius: 8px; padding: 4px 10px;
    background: #fafbfa; page-break-inside: avoid; }
  summary { cursor: pointer; font-weight: 600; color: var(--muted); padding: 4px 0; }
  .mermaid { text-align: center; margin: 14px 0; page-break-inside: avoid; }
  hr { border: none; border-top: 1px solid var(--line); margin: 28px 0; }
  @page { size: A4; margin: 14mm 12mm; }
</style>
</head>
<body>
<div id="content">Рендер…</div>
<script type="text/plain" id="src">${md}</script>
<script>
  const raw = document.getElementById("src").textContent;
  marked.setOptions({ gfm: true, breaks: false });
  let out = marked.parse(raw);
  document.getElementById("content").innerHTML = out;
  // marked отдаёт mermaid как <pre><code class="language-mermaid">…</code></pre> — превратим в <div class="mermaid">.
  document.querySelectorAll("code.language-mermaid").forEach((c) => {
    const div = document.createElement("div");
    div.className = "mermaid";
    div.textContent = c.textContent;
    c.closest("pre").replaceWith(div);
  });
  // Раскрыть все <details>, чтобы в PDF было видно всё содержимое.
  document.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""));
  mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });
  window.__ready = false;
  mermaid.run({ querySelector: ".mermaid" }).then(() => { window.__ready = true; })
    .catch((e) => { console.error(e); window.__ready = true; });
</script>
</body>
</html>`;

writeFileSync(outPath, html);
console.log("wrote", outPath, "(", html.length, "bytes )");
