// СТОЛ ПОД ОКНАМИ — холст, как в продукте: сукно, кромка, места с людьми, карта и ряд прав внизу.
//
// Ни одной ручки: это фон. Но места он рисует НЕ для красоты — тултип управления открывается по
// тапу на аватар прямо на сукне, и ему нужно знать, где этот аватар лежит. Поэтому `draw` возвращает
// координаты мест: разметка сверху ставит тултип по ним, а не по выдуманным числам.

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

  const PALETTE = ["#f2c14e", "#7fd1b9", "#e08b3f", "#b98fe0", "#8fb4e0", "#e0483f", "#a8e08f", "#e08fb4"];

  function box(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function rights(g, W, H) {
    const n = 7, size = Math.min(46, Math.round((W - 24) / n) - 6), gap = 6;
    const total = n * size + (n - 1) * gap;
    const x0 = Math.round((W - total) / 2);
    const y = H - size - 22;
    g.fillStyle = "rgba(11,7,4,.55)";
    g.fillRect(0, y - 14, W, size + 36);
    for (let i = 0; i < n; i += 1) {
      const x = x0 + i * (size + gap);
      box(g, x, y, size, size, 8);
      const grad = g.createLinearGradient(0, y, 0, y + size);
      grad.addColorStop(0, "#25321f");
      grad.addColorStop(1, "#16210f");
      g.fillStyle = grad; g.fill();
      g.lineWidth = 3; g.strokeStyle = T.black; g.stroke();
      box(g, x + 2.5, y + 2.5, size - 5, size - 5, 6);
      g.lineWidth = 2; g.strokeStyle = T.wood; g.stroke();
      g.strokeStyle = T.inkDim; g.lineWidth = 2;
      g.beginPath();
      const cx = x + size / 2, cy = y + size / 2, u = size * 0.18;
      if (i % 3 === 0) { g.moveTo(cx, cy - u); g.lineTo(cx, cy + u); g.moveTo(cx - u, cy); g.lineTo(cx + u, cy); }
      else if (i % 3 === 1) { g.arc(cx, cy, u, 0, Math.PI * 2); }
      else { g.moveTo(cx - u, cy - u); g.lineTo(cx + u, cy + u); g.moveTo(cx + u, cy - u); g.lineTo(cx - u, cy + u); }
      g.stroke();
    }
  }

  /** Диск сидящего на сукне: кольцо в его цвете, буква внутри, золотой ободок у того, чей ход. */
  function seat(g, x, y, r, colour, letter, turn, away) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = away ? "#2a3a31" : PALETTE[colour];
    g.fill();
    g.lineWidth = 3; g.strokeStyle = T.black; g.stroke();
    if (turn) { g.beginPath(); g.arc(x, y, r + 4, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = T.gold; g.stroke(); }
    g.fillStyle = away ? T.inkDim : T.black;
    g.font = `${Math.round(r * 0.9)}px Tiny5, monospace`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(letter, x, y + 1);
  }

  /** Рисует стол и возвращает места: `{key, x, y, r}` в css-пикселях — их берёт тултип. */
  function draw(canvas, { W, H, top, people }) {
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    g.fillStyle = T.feltDark;
    g.fillRect(0, 0, W, H);

    const cx = W / 2, cy = top + (H - top) * 0.42;
    const rx = W * 0.86, ry = (H - top) * 0.46;
    g.save();
    g.translate(cx, cy);
    g.scale(1, ry / rx);
    g.beginPath();
    g.arc(0, 0, rx, 0, Math.PI * 2);
    g.restore();
    g.lineWidth = 18; g.strokeStyle = T.panel; g.stroke();
    g.fillStyle = T.felt; g.fill();
    g.lineWidth = 3; g.strokeStyle = T.black; g.stroke();

    const cw = Math.round(W * 0.17), ch = Math.round(cw * 1.45);
    box(g, cx - cw / 2, cy - ch / 2, cw, ch, 6);
    g.fillStyle = T.ink; g.fill();
    g.lineWidth = 2; g.strokeStyle = T.black; g.stroke();
    box(g, cx - cw / 2 + 5, cy - ch / 2 + 5, cw - 10, ch - 10, 4);
    g.fillStyle = "#9c2f2a"; g.fill();

    // МЕСТА: СВОЁ ВНИЗУ, ЧУЖИЕ ПО ДАЛЬНЕЙ ДУГЕ. Не по кругу: на телефоне низ занят рукой и правами,
    // и посаженный туда сосед оказывается под пальцем, а его тултип — за нижним HUD.
    const spots = [];
    const r = 21;
    const seated = people.filter((p) => p.seat);
    const others = seated.slice(1);
    const arc = (i) => others.length === 1 ? 1.5 * Math.PI : (1.12 + (0.76 * i) / (others.length - 1)) * Math.PI;
    // Диски садятся по эллипсу, ВПИСАННОМУ В ЭКРАН, а не по кромке стола: стол шире телефона, и
    // посаженный по нему сосед уезжает за край — тултипу тогда не к чему прицепиться.
    const sx = Math.min(rx * 0.72, W / 2 - 46);
    const sy = ry * 0.72;
    seated.forEach((p, i) => {
      const a = i === 0 ? Math.PI / 2 : arc(i - 1);
      const x = cx + Math.cos(a) * sx;
      const y = cy + Math.sin(a) * sy;
      seat(g, x, y, r, p.colour, p.name[0], i === 0, p.away);
      spots.push({ key: p.key, x, y, r });
    });

    rights(g, W, H);
    return spots;
  }

  window.Felt = { T, PALETTE, draw };
})();
