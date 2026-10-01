// ПИКСЕЛЬНЫЕ ИКОНКИ ХУДА — сетка 12×12, один цвет чернил и один акцент. Рисуются кодом (линия, рамка, круг, повёрнутая карта),
// а не вручную строками: так их можно править одной цифрой, и все они из одной руки.
//
//   icon("fan", { size: 3 })  → <svg> размером 36 px: 12 клеток × 3 px, края без сглаживания.
//   цвета берутся из CSS: --ic (чернила), --ac (акцент), --dm (приглушённый), --rd (тревожный).
(function (root) {
  const N = 12;

  function grid() {
    const cells = new Map();
    const put = (x, y, c) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= N || y >= N) return;
      cells.set(y * N + x, c);
    };
    const g = {
      cells,
      px: (x, y, c = "i") => put(x, y, c),
      line(x0, y0, x1, y1, c = "i") {
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (;;) {
          put(x0, y0, c);
          if (x0 === x1 && y0 === y1) break;
          const e2 = 2 * err;
          if (e2 >= dy) { err += dy; x0 += sx; }
          if (e2 <= dx) { err += dx; y0 += sy; }
        }
      },
      poly(points, c = "i", close = false) {
        for (let k = 0; k + 1 < points.length; k += 1) g.line(points[k][0], points[k][1], points[k + 1][0], points[k + 1][1], c);
        if (close) g.line(points.at(-1)[0], points.at(-1)[1], points[0][0], points[0][1], c);
      },
      rect(x, y, w, h, c = "i") { g.poly([[x, y], [x + w - 1, y], [x + w - 1, y + h - 1], [x, y + h - 1]], c, true); },
      fill(x, y, w, h, c = "i") { for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) put(x + i, y + j, c); },
      circle(cx, cy, r, c = "i") {
        for (let a = 0; a < 360; a += 4) put(cx + Math.cos((a * Math.PI) / 180) * r, cy + Math.sin((a * Math.PI) / 180) * r, c);
      },
      /** Карта-рамка, повёрнутая на `deg` вокруг точки `(px, py)`; левый верхний угол до поворота — `(x, y)`. */
      card(deg, x, y, w, h, px, py, c = "i") {
        const a = (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
        const rot = ([X, Y]) => [px + (X - px) * co - (Y - py) * si, py + (X - px) * si + (Y - py) * co];
        g.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(rot), c, true);
      },
      erase(x, y) { cells.delete(Math.round(y) * N + Math.round(x)); },
    };
    return g;
  }

  /** Пипсы мастей 7×7 — для фишек масти и значков порядка. Строки сверху вниз; `#` — клетка. */
  const PIPS = {
    s: ["...#...", "..###..", ".#####.", "#######", "#######", "..###..", ".#####."],
    h: [".##.##.", "#######", "#######", "#######", ".#####.", "..###..", "...#..."],
    d: ["...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#..."],
    c: ["..###..", "..###..", "#######", "#######", "..#.#..", "..###..", ".#####."],
  };

  const DEFS = {
    // — верхняя полоса
    exit: (g) => { g.poly([[6, 1], [1, 1], [1, 10], [6, 10]]); g.line(4, 5, 10, 5, "i"); g.line(4, 6, 10, 6, "i"); g.line(8, 3, 10, 5); g.line(8, 8, 10, 6); },
    journal: (g) => { g.rect(2, 1, 8, 10); g.line(4, 4, 7, 4); g.line(4, 6, 7, 6); g.line(4, 8, 6, 8); g.px(10, 3, "a"); },
    gear: (g) => {
      g.circle(6, 6, 3); g.circle(6, 6, 2.2); g.px(6, 6, "a");
      for (const [x, y, w, h] of [[5, 0, 2, 2], [5, 10, 2, 2], [0, 5, 2, 2], [10, 5, 2, 2]]) g.fill(x, y, w, h);
      for (const [x, y] of [[2, 2], [9, 2], [2, 9], [9, 9]]) g.px(x, y);
    },
    chat: (g) => { g.rect(1, 2, 10, 6); g.line(3, 8, 3, 10); g.line(3, 10, 5, 8); g.px(3, 5, "a"); g.px(6, 5, "a"); g.px(8, 5, "a"); },
    // — камера и тело
    view: (g) => { g.poly([[1, 6], [4, 3], [8, 3], [11, 6], [8, 9], [4, 9]], "i", true); g.fill(5, 5, 2, 2, "a"); },
    gyro: (g) => { g.rect(4, 1, 4, 10); g.px(6, 9, "a"); g.px(1, 5); g.px(2, 4); g.px(2, 6); g.px(10, 5); g.px(9, 4); g.px(9, 6); },
    stand: (g) => { g.fill(5, 0, 2, 2, "a"); g.line(6, 3, 6, 7); g.line(2, 5, 10, 5); g.line(6, 7, 3, 11); g.line(6, 7, 9, 11); },
    sit: (g) => { g.fill(3, 0, 2, 2, "a"); g.line(4, 3, 4, 7); g.line(4, 7, 9, 7); g.line(9, 7, 9, 11); g.line(4, 5, 7, 6); },
    orbit: (g) => { for (let a = 0; a < 360; a += 5) g.px(6 + Math.cos((a * Math.PI) / 180) * 5.3, 6 + Math.sin((a * Math.PI) / 180) * 2.8, "i"); g.fill(5, 5, 2, 2, "d"); g.fill(10, 4, 2, 2, "a"); },
    topdown: (g) => { g.circle(6, 6, 5); g.rect(4, 3, 4, 6, "a"); },
    zoomIn: (g) => { g.circle(5, 5, 3.4); g.line(8, 8, 11, 11); g.line(3, 5, 7, 5, "a"); g.line(5, 3, 5, 7, "a"); },
    zoomOut: (g) => { g.circle(5, 5, 3.4); g.line(8, 8, 11, 11); g.line(3, 5, 7, 5, "a"); },
    compass: (g) => { g.circle(6, 6, 5.2); g.line(6, 2, 6, 6, "a"); g.px(5, 4, "a"); g.px(7, 4, "a"); g.line(6, 7, 6, 9, "d"); },
    // — рука
    fan: (g) => { g.card(-32, 4, 2, 4, 9, 6, 12, "i"); g.card(32, 4, 2, 4, 9, 6, 12, "i"); g.card(0, 4, 0, 4, 9, 6, 12, "a"); },
    row: (g) => { g.rect(1, 3, 4, 7, "d"); g.rect(4, 3, 4, 7, "d"); g.rect(7, 3, 4, 7, "i"); g.line(8, 5, 9, 5, "a"); },
    tuck: (g) => { g.rect(1, 8, 10, 3); g.rect(2, 5, 8, 3, "d"); g.line(6, 0, 6, 3, "a"); g.line(4, 1, 6, 3, "a"); g.line(8, 1, 6, 3, "a"); },
    flip: (g) => { g.rect(3, 2, 6, 8); g.line(5, 5, 7, 5, "a"); g.px(10, 2); g.line(9, 1, 11, 1); g.px(10, 3); g.px(1, 9); g.line(0, 10, 2, 10); g.px(1, 8); },
    // — порядок
    suit: (g) => { for (let r = 0; r < 7; r += 1) for (let c = 0; c < 7; c += 1) if (PIPS.s[r][c] === "#") g.px(c + 2, r + 1, "i"); g.line(1, 10, 10, 10, "a"); },
    rank: (g) => { g.fill(1, 8, 2, 3); g.fill(4, 6, 2, 5); g.fill(7, 4, 2, 7); g.fill(10, 1, 2, 10, "a"); },
    reverse: (g) => { g.line(3, 10, 3, 2); g.px(2, 3); g.px(4, 3); g.px(1, 4); g.px(5, 4); g.line(9, 1, 9, 9, "a"); g.px(8, 8, "a"); g.px(10, 8, "a"); g.px(7, 7, "a"); g.px(11, 7, "a"); },
    shuffle: (g) => { g.line(0, 3, 4, 3); g.line(4, 3, 8, 8); g.line(8, 8, 11, 8); g.line(0, 8, 4, 8); g.line(4, 8, 8, 3); g.line(8, 3, 11, 3); g.px(10, 1, "a"); g.px(10, 5, "a"); g.px(10, 6, "a"); g.px(10, 10, "a"); },
    // — стул
    chair: (g) => { g.rect(3, 0, 6, 6); g.line(2, 6, 9, 6); g.line(3, 7, 3, 11); g.line(8, 7, 8, 11); g.fill(2, 6, 8, 1, "a"); },
    lock: (g) => { g.poly([[3, 5], [3, 3], [4, 1], [7, 1], [8, 3], [8, 5]]); g.fill(2, 5, 8, 6); g.px(5, 7, "bg"); g.px(5, 8, "bg"); g.px(6, 7, "bg"); g.px(6, 8, "bg"); },
    hide: (g) => { g.poly([[1, 6], [4, 3], [8, 3], [11, 6], [8, 9], [4, 9]], "d", true); g.fill(5, 5, 2, 2, "d"); g.line(1, 11, 11, 1, "i"); g.line(2, 11, 11, 2, "i"); },
    reject: (g) => { g.rect(1, 8, 10, 3, "d"); g.line(6, 0, 6, 5, "d"); g.line(4, 3, 6, 5, "d"); g.line(8, 3, 6, 5, "d"); g.line(1, 11, 11, 1, "r"); g.line(2, 11, 11, 2, "r"); },
    keep: (g) => { g.line(2, 11, 2, 2); g.fill(2, 1, 8, 4, "a"); g.line(2, 5, 9, 5, "i"); },
    leave: (g) => { g.poly([[6, 1], [1, 1], [1, 10], [6, 10]], "r"); g.line(4, 5, 10, 5, "r"); g.line(4, 6, 10, 6, "r"); g.line(8, 3, 10, 5, "r"); g.line(8, 8, 10, 6, "r"); },
    // — выбор
    cursor: (g) => { g.poly([[2, 1], [2, 10], [4, 8], [6, 11], [8, 10], [6, 7], [9, 7]], "i", true); },
    lasso: (g) => { for (let a = 0; a < 360; a += 40) g.px(6 + Math.cos((a * Math.PI) / 180) * 5, 4 + Math.sin((a * Math.PI) / 180) * 3, "i"); g.line(3, 7, 2, 10, "a"); g.line(2, 10, 5, 10, "a"); },
    collect: (g) => { g.line(0, 0, 3, 3); g.line(11, 0, 8, 3); g.line(0, 11, 3, 8); g.line(11, 11, 8, 8); g.rect(4, 4, 4, 4, "a"); },
    asis: (g) => { g.rect(0, 1, 4, 5); g.rect(7, 3, 4, 5); g.rect(2, 6, 4, 5, "a"); },
    sideKeep: (g) => { g.rect(2, 1, 8, 10); g.line(2, 6, 9, 6); g.fill(4, 3, 4, 2, "a"); },
    sideDown: (g) => { g.rect(2, 1, 8, 10); g.line(3, 2, 8, 9, "d"); g.line(8, 2, 3, 9, "d"); g.line(3, 5, 8, 5, "d"); },
    sideUp: (g) => { g.rect(2, 1, 8, 10); for (let r = 0; r < 7; r += 1) for (let c = 0; c < 7; c += 1) if (PIPS.h[r][c] === "#") g.px(c + 2.5, r + 2.5, "r"); },
    cancel: (g) => { g.line(2, 2, 9, 9, "r"); g.line(9, 2, 2, 9, "r"); g.line(2, 3, 8, 9, "r"); g.line(8, 2, 2, 8, "r"); },
    toHand: (g) => { g.line(6, 0, 6, 7); g.line(3, 4, 6, 7); g.line(9, 4, 6, 7); g.poly([[1, 8], [1, 11], [10, 11], [10, 8]], "a"); },
    gather: (g) => { g.rect(1, 1, 7, 8, "d"); g.rect(3, 2, 7, 8, "d"); g.rect(4, 3, 7, 8, "i"); g.px(7, 7, "a"); },
    // — прочее
    people: (g) => { g.fill(2, 1, 3, 3); g.fill(1, 5, 5, 5); g.fill(8, 2, 3, 3, "d"); g.fill(7, 6, 5, 4, "d"); },
    turn: (g) => { g.fill(5, 0, 2, 6, "a"); g.line(2, 6, 6, 10, "a"); g.line(9, 6, 6, 10, "a"); g.line(3, 6, 5, 8, "a"); g.line(8, 6, 6, 8, "a"); },
    cards: (g) => { g.rect(2, 2, 6, 8, "d"); g.rect(4, 1, 6, 8, "i"); },
    close: (g) => { g.line(2, 2, 9, 9); g.line(9, 2, 2, 9); },
    pick: (g) => { g.rect(2, 1, 8, 10); g.line(4, 5, 5, 7, "a"); g.line(5, 7, 8, 3, "a"); },
  };

  function icon(name, { size = 3, cls = "" } = {}) {
    const g = grid();
    (DEFS[name] || DEFS.close)(g);
    const rows = [];
    for (let y = 0; y < N; y += 1) {
      let x = 0;
      while (x < N) {
        const c = g.cells.get(y * N + x);
        if (!c) { x += 1; continue; }
        let w = 1;
        while (x + w < N && g.cells.get(y * N + x + w) === c) w += 1;
        rows.push(`<rect x="${x}" y="${y}" width="${w}" height="1" class="p-${c}"/>`);
        x += w;
      }
    }
    return `<svg class="ic ${cls}" width="${N * size}" height="${N * size}" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" aria-hidden="true">${rows.join("")}</svg>`;
  }

  /** Пип масти 7×7 как inline-svg (`s h d c`). */
  function pip(suit, size = 2, cls = "") {
    const rows = [];
    PIPS[suit].forEach((row, y) => { let x = 0; while (x < 7) { if (row[x] !== "#") { x += 1; continue; } let w = 1; while (x + w < 7 && row[x + w] === "#") w += 1; rows.push(`<rect x="${x}" y="${y}" width="${w}" height="1"/>`); x += w; } });
    return `<svg class="pip ${cls}" width="${7 * size}" height="${7 * size}" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">${rows.join("")}</svg>`;
  }

  root.PixelIcons = { icon, pip, names: Object.keys(DEFS) };
})(window);
