// Неприметный тумблер на НОВЫЙ клиент (v2). Временно: новый клиент раздаётся под сабрутом
// /v2/ того же домена. Локально ведёт на dev-порт client2 (5174). Живёт в углу экрана, еле
// виден (см. .ver-switch-v2) — переключение версий доступно, но на глаза не лезет.
const V2_URL = import.meta.env.DEV ? "http://localhost:5174/" : "/v2/";

export function VersionSwitch() {
  return (
    <a className="ver-switch-v2" href={V2_URL} aria-label="новый клиент (v2)">
      v2
    </a>
  );
}
