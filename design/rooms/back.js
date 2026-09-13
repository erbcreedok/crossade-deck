// ФОН МОСТА — сукно с трилистниками, и ничего больше.
//
// Страница списка комнат не принадлежит ни хабу, ни игре: её открывают между ними. Поэтому под ней
// не полка и не стол, а только сукно — тот же материал, на котором стоит всё остальное.

(function () {
  const T = {
    felt: "#173d2d",
    feltDark: "#0f2e22",
    panel: "#3a2a1d",
    panelLight: "#4a3627",
    well: "#1c120b",
    ink: "#f5ead0",
    inkDim: "#cdb98f",
    gold: "#f2c14e",
    danger: "#e0483f",
    black: "#0b0704",
    wood: "#6b4d2c",
    sparkle: "#b09a5c",
  };

  function club(g, x, y, s, color) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y - s * 0.35, s * 0.34, 0, Math.PI * 2);
    g.arc(x - s * 0.36, y + s * 0.12, s * 0.34, 0, Math.PI * 2);
    g.arc(x + s * 0.36, y + s * 0.12, s * 0.34, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x - s * 0.08, y, s * 0.16, s * 0.55);
  }

  function draw(canvas, { W, H }) {
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = T.felt;
    g.fillRect(0, 0, W, H);
    const step = 58;
    for (let y = -step; y < H + step; y += step) {
      for (let x = -step; x < W + step; x += step) {
        club(g, x + (Math.round(y / step) % 2 === 0 ? 0 : step / 2), y, 13, T.feltDark);
      }
    }
  }

  window.Back = { T, draw };
})();
