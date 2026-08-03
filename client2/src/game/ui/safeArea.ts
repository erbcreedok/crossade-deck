// Высота верхней сейф-зоны (чёлка/Dynamic Island) в px. Канвас рисует HUD сам, а env(safe-area-*)
// умеет читать только CSS — поэтому меряем зондом: временный div с padding-top:env(...) и снимаем
// вычисленный padding. В браузере без выреза и вне PWA inset = 0, и всё вырождается в прежнее.
//
// Читаем на КАЖДЫЙ вызов (не кэшируем): при повороте айфона верхний inset меняется (в ландшафте
// вырез уходит вбок), а layout топбара и так зовётся лишь на ресайз — зонд там не в горячем пути.
export function safeAreaTop(): number {
  if (typeof document === "undefined") return 0; // тесты/SSR — DOM нет
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;visibility:hidden;padding-top:env(safe-area-inset-top)";
  document.body.appendChild(probe);
  const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return inset;
}
