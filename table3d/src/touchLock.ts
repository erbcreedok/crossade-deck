// ПАЛЕЦ НА СТОЛЕ НЕ ДОЛЖЕН ДЕЛАТЬ ТОГО, ЧТО ДЕЛАЕТ БРАУЗЕР: удержание на айфоне зовёт лупу и выделение текста, двойной тап — зум страницы (его гасит `touch-action: manipulation`).
// Запирается документ целиком (стол, худ, окна, кнопки стенда), один раз на документ; поля ввода остаются текстовыми.
const docs = new WeakSet<Document>();
const css = `:where(*) { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; -webkit-user-drag: none; touch-action: manipulation; }
:where(input, textarea, [contenteditable]) { -webkit-user-select: text; user-select: text; }`;
const typing = (e: Event): boolean => !!(e.target as Element | null)?.closest?.("input, textarea, [contenteditable]");

export function lockTouch(doc: Document = document): void {
  if (docs.has(doc)) return;
  docs.add(doc);
  const style = doc.createElement("style");
  style.textContent = css;
  doc.head.append(style);
  const view = doc.querySelector('meta[name="viewport"]');
  if (view && !/user-scalable/.test(view.getAttribute("content") ?? "")) view.setAttribute("content", `${view.getAttribute("content")}, maximum-scale=1, user-scalable=no`);
  // Щипок и двойной тап (iOS шлёт `gesture*`), выделение и двойной щелчок — не нужны: масштаб у стола свой.
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) doc.addEventListener(type, (e) => e.preventDefault());
  doc.addEventListener("selectstart", (e) => { if (!typing(e)) e.preventDefault(); });
  doc.addEventListener("dblclick", (e) => { if (!typing(e)) e.preventDefault(); });
}
