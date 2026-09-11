// ЧТО ЛЕЖИТ ПОД ШАПКОЙ ХАБА — полка с играми, на холсте, потому что в продукте она холст и есть.
//
// Вся первая страница у нас — дерево кита: сукно, трилистники, искры, плитки, подписи. Рисовать её
// здесь разметкой значило бы подгонять шапку под экран, которого не существует. Поэтому холст, и
// ни одной ручки: это фон, а не предмет. Предмет — то, что над ним: профиль и вход.

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

  const GAMES = ["Косынка", "Карты", "Шахматы", "Нарды"];

  function box(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /** Трилистник — тот же мотив, которым засеяно сукно хаба. */
  function club(g, x, y, s, color) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y - s * 0.35, s * 0.34, 0, Math.PI * 2);
    g.arc(x - s * 0.36, y + s * 0.12, s * 0.34, 0, Math.PI * 2);
    g.arc(x + s * 0.36, y + s * 0.12, s * 0.34, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x - s * 0.08, y, s * 0.16, s * 0.55);
  }

  function sparkle(g, x, y, s, color) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x, y - s);
    g.lineTo(x + s * 0.42, y);
    g.lineTo(x, y + s);
    g.lineTo(x - s * 0.42, y);
    g.closePath();
    g.fill();
  }

  /** Плитка игры: чёрная кромка, золотое кольцо, тёмная фаска, подпись внизу. */
  function tile(g, x, y, w, h, caption) {
    box(g, x, y, w, h, 4);
    g.fillStyle = T.gold;
    g.fill();
    box(g, x + 4, y + 4, w - 8, h - 8, 3);
    g.fillStyle = T.black;
    g.fill();
    box(g, x + 7, y + 7, w - 14, h - 14, 3);
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, T.panelLight);
    grad.addColorStop(1, "#2a1d13");
    g.fillStyle = grad;
    g.fill();

    // Место картинки игры: в продукте здесь лежит её собственный рисунок.
    g.fillStyle = "rgba(11,7,4,.35)";
    box(g, x + w * 0.22, y + h * 0.16, w * 0.56, h * 0.46, 4);
    g.fill();

    g.fillStyle = T.ink;
    g.font = `${Math.round(h * 0.13)}px Tiny5, monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(caption, x + w / 2, y + h * 0.8);
  }

  /**
   * Полка целиком. `top` — сколько пикселей сверху занято шапкой: плитки начинаются под ней, и
   * именно это число ручки наверху и двигают.
   */
  function draw(canvas, { W, H, top, title, titleSize, columns, tileGap, margin }) {
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    g.fillStyle = T.felt;
    g.fillRect(0, 0, W, H);

    // Сукно: трилистники сеткой и редкие искры между ними.
    const step = 58;
    for (let y = -step; y < H + step; y += step) {
      for (let x = -step; x < W + step; x += step) {
        const odd = Math.round(y / step) % 2 === 0;
        club(g, x + (odd ? 0 : step / 2), y, 13, T.feltDark);
      }
    }
    for (let i = 0; i < 26; i += 1) {
      const x = ((i * 97) % W) + 9;
      const y = ((i * 173) % H) + 13;
      sparkle(g, x, y, i % 3 === 0 ? 6 : 4, T.sparkle);
    }

    let y = top + 18;
    if (title) {
      g.fillStyle = T.gold;
      g.font = `${titleSize}px 'Press Start 2P', monospace`;
      g.textAlign = "center";
      g.textBaseline = "top";
      g.fillText("Crossade", W / 2, y);
      y += titleSize + 26;
    }

    const cols = columns;
    const tw = Math.round((W - margin * 2 - tileGap * (cols - 1)) / cols);
    const th = Math.round(tw * (cols === 1 ? 0.42 : 0.86));
    GAMES.forEach((name, i) => {
      const cx = margin + (i % cols) * (tw + tileGap);
      const cy = y + Math.floor(i / cols) * (th + tileGap);
      tile(g, cx, cy, tw, th, name);
    });
  }

  window.HubStand = { T, draw };
})();
