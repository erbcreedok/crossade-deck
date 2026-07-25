// Брендовая пилюля в зоне статус-бара (как «2ГИС»), с нашим лейблом. Видна только в
// установленном PWA (standalone) — см. @media (display-mode: standalone) в theme.css.
export function BrandBadge() {
  return <div className="brand-badge">🃏 crusade</div>;
}
