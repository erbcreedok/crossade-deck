// РИСУНКИ ЧАСТЕЙ, НАРИСОВАННЫЕ КОДОМ (`skins.ts`, `art.kind: "draw"`) — шар, палка, бочонок, кубик, корона,
// колпак, ноги-палки. Краски — колоды (красная, синяя, золото), их подменяет расцветка; те же рисунки, что на
// стенде `design/skinmaker`.

const PAPER = "#f7f1e6", BLACK = "#0b0704", RED = "#b3221f", BLUE = "#1d4f80", GOLD = "#f2c14e";
const svg = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** Очки кубика по граням — как у настоящей кости: напротив единицы шестёрка, тройки — четвёрка, пятёрки — двойка. */
export const PIP_AT: Record<string, [number, number][]> = {
  front: [[0.5, 0.5]], bottom: [[0.28, 0.28], [0.72, 0.72]], right: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]], left: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  top: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]], back: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
};

function barrel(view: string): string {
  // Бочонок в 18 ракурсах: эмблема едет по кругу — видно, на сколько он повёрнут.
  const a = (parseInt(view.slice(1), 10) * Math.PI) / 180, x = 60 + Math.sin(a) * 34, front = Math.cos(a) > 0;
  const hoops = [30, 62, 92].map((y) => `<path d="M16 ${y} Q60 ${y + 6} 104 ${y}" fill="none" stroke="${GOLD}" stroke-width="5"/>`).join("");
  return svg(120, 100, `<path d="M18 100 Q8 58 22 16 Q60 6 98 16 Q112 58 102 100 Z" fill="${BLUE}" stroke="${BLACK}" stroke-width="5"/>${hoops}`
    + (front ? `<circle cx="${x}" cy="46" r="${9 + 5 * Math.cos(a)}" fill="${RED}" stroke="${BLACK}" stroke-width="3"/>` : `<rect x="${x - 4}" y="40" width="8" height="12" fill="${BLACK}" opacity=".5"/>`));
}

function crown(view: string): string {
  const side = view === "right";
  const w = side ? 44 : 70, x = 50 - w / 2;
  const teeth = side ? `M${x} 70 L${x} 40 L${x + 14} 56 L${x + 26} 32 L${x + 36} 56 L${x + w} 44 L${x + w} 70 Z` : `M${x} 70 L${x} 38 L${x + 17} 56 L${x + 35} 28 L${x + 53} 56 L${x + w} 38 L${x + w} 70 Z`;
  return svg(100, 100, `<path d="${teeth}" fill="${GOLD}" stroke="${BLACK}" stroke-width="5" stroke-linejoin="round"/><rect x="${x}" y="62" width="${w}" height="12" fill="${RED}" stroke="${BLACK}" stroke-width="4"/>${view === "back" ? "" : `<circle cx="50" cy="${side ? 46 : 42}" r="6" fill="${BLUE}" stroke="${BLACK}" stroke-width="3"/>`}`);
}

/** Грань кубика во всю ширину — для превью; за столом кубик рисуется коробкой по граням (`bodyView.ts`). */
const cubeFace = (view: string): string => svg(100, 100, `<rect width="100" height="100" fill="${PAPER}" stroke="${BLACK}" stroke-width="6"/>${(PIP_AT[view] ?? []).map(([x, y]) => `<circle cx="${x * 100}" cy="${y * 100}" r="8.5" fill="${RED}"/>`).join("")}`);

const ART: Record<string, (view: string) => string> = {
  ball: () => svg(100, 100, `<circle cx="50" cy="52" r="40" fill="${PAPER}" stroke="${BLACK}" stroke-width="6"/><circle cx="50" cy="52" r="30" fill="${RED}" opacity=".18"/>`),
  stick: () => svg(120, 100, `<path d="M20 20 H100 M60 20 V100" stroke="${BLACK}" stroke-width="12" stroke-linecap="round"/><path d="M20 20 H100 M60 20 V100" stroke="${RED}" stroke-width="5" stroke-linecap="round"/>`),
  "stick-legs": () => svg(120, 100, `<path d="M60 0 L42 100 M60 0 L78 100" stroke="${BLACK}" stroke-width="10" stroke-linecap="round"/><path d="M60 0 L42 100 M60 0 L78 100" stroke="${RED}" stroke-width="4" stroke-linecap="round"/>`),
  cap: () => svg(100, 100, `<path d="M18 88 Q50 -10 86 30 Q70 50 82 88 Z" fill="${RED}" stroke="${BLACK}" stroke-width="5"/><circle cx="86" cy="30" r="9" fill="${GOLD}" stroke="${BLACK}" stroke-width="4"/><rect x="12" y="80" width="78" height="14" rx="6" fill="${PAPER}" stroke="${BLACK}" stroke-width="4"/>`),
  barrel,
  crown,
  cube: cubeFace,
};

/** Рисунок части `art` в ракурсе `view` — SVG строкой; неизвестный — пустой. */
export const drawArt = (art: string, view: string): string => (ART[art] ?? (() => svg(10, 10, "")))(view);
