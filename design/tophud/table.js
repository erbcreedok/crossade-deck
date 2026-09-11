// THE SCREEN UNDER THE BAR — drawn on a CANVAS, because in the product it is one.
//
// The stand exists to judge the top strip against what it actually covers, and the two halves are
// not the same kind of thing. The table and the controls that move pieces are the GAME: a tree the
// kit paints on canvas, where a press is a hit test and a button is a node. The top strip is the
// page's own furniture over it. Drawing the bottom row here in markup would make the stand agree
// with a screen that does not exist.
//
// So: nothing here is tunable. It is the backdrop — felt, the table's rim, a card in the middle and
// the row of rights along the bottom — redrawn at whatever size the phone gives, so the bar above
// is always being looked at over the picture it will actually sit on.

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
  };

  /** A rounded rectangle, the one shape everything on the felt is made of. */
  function box(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /** The rights along the bottom — the game's own controls, in the game's own paint. */
  function rights(g, W, H) {
    const n = 7, size = Math.min(46, Math.round((W - 24) / n) - 6), gap = 6;
    const total = n * size + (n - 1) * gap;
    const x0 = Math.round((W - total) / 2);
    const y = H - size - 22;
    g.save();
    g.fillStyle = "rgba(11,7,4,.55)";
    g.fillRect(0, y - 14, W, size + 36);
    for (let i = 0; i < n; i += 1) {
      const x = x0 + i * (size + gap);
      box(g, x, y, size, size, 8);
      const grad = g.createLinearGradient(0, y, 0, y + size);
      grad.addColorStop(0, "#25321f");
      grad.addColorStop(1, "#16210f");
      g.fillStyle = grad;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = T.black;
      g.stroke();
      box(g, x + 2.5, y + 2.5, size - 5, size - 5, 6);
      g.lineWidth = 2;
      g.strokeStyle = T.wood;
      g.stroke();
      // A glyph stands in for the icon: at this size the shape is what is being judged above, not
      // which right it is.
      g.strokeStyle = T.inkDim;
      g.lineWidth = 2;
      g.beginPath();
      const cx = x + size / 2, cy = y + size / 2, u = size * 0.18;
      if (i % 3 === 0) { g.moveTo(cx, cy - u); g.lineTo(cx, cy + u); g.moveTo(cx - u, cy); g.lineTo(cx + u, cy); }
      else if (i % 3 === 1) { g.arc(cx, cy, u, 0, Math.PI * 2); }
      else { g.moveTo(cx - u, cy - u); g.lineTo(cx + u, cy + u); g.moveTo(cx + u, cy - u); g.lineTo(cx - u, cy + u); }
      g.stroke();
    }
    g.restore();
  }

  /** The felt, the rim, and one card standing in the middle of it. */
  function draw(canvas, { W, H, top }) {
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    g.fillStyle = T.feltDark;
    g.fillRect(0, 0, W, H);

    // THE TABLE ITSELF — an ellipse wider than the screen, so its rim leaves at the sides exactly
    // the way the real desk's does at this zoom.
    const cx = W / 2, cy = top + (H - top) * 0.42;
    const rx = W * 0.86, ry = (H - top) * 0.46;
    g.save();
    g.translate(cx, cy);
    g.scale(1, ry / rx);
    g.beginPath();
    g.arc(0, 0, rx, 0, Math.PI * 2);
    g.restore();
    g.lineWidth = 18;
    g.strokeStyle = T.panel;
    g.stroke();
    g.fillStyle = T.felt;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = T.black;
    g.stroke();

    // A card, face down, where the stock stands.
    const cw = Math.round(W * 0.17), ch = Math.round(cw * 1.45);
    box(g, cx - cw / 2, cy - ch / 2, cw, ch, 6);
    g.fillStyle = T.ink;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = T.black;
    g.stroke();
    box(g, cx - cw / 2 + 5, cy - ch / 2 + 5, cw - 10, ch - 10, 4);
    g.fillStyle = "#9c2f2a";
    g.fill();

    rights(g, W, H);
  }

  window.TopStand = { T, draw };
})();
