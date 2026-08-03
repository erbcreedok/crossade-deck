import { useEffect, useState } from "react";

// Брендовая пилюля в сейф-зоне статус-бара. Показываем ТОЛЬКО в установленной PWA на iPhone с
// верхним вырезом (чёлка/Dynamic Island). На Android, в браузере и на iPhone без выреза (SE/8) —
// ничего не рендерим. CSS не умеет отличить iOS, поэтому решаем в JS (по факту наличия выреза).

/** Высота верхней сейф-зоны в px: читаем env(safe-area-inset-top) через временный зонд. */
function safeTopInset(): number {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;visibility:hidden;padding-top:env(safe-area-inset-top)";
  document.body.appendChild(probe);
  const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return inset;
}

function shouldShow(): boolean {
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (!standalone) return false; // только установленная PWA
  if (!/iPhone|iPod/.test(navigator.userAgent)) return false; // только iPhone (Android/десктоп — пусто)
  return safeTopInset() > 30; // вырез есть: у чёлки/острова inset ≥44, у SE/8 всего ~20
}

export function BrandBadge() {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(shouldShow()), []);
  if (!show) return null;
  return <div className="brand-badge">🃏 crossade</div>;
}
