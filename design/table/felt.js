// СТОЛ ПОД ОКНАМИ — холст, как в продукте: сукно, кромка, места с людьми и то, что лежит на столе.
//
// Нижнего HUD здесь НЕТ: свои права и позы рисует разметка поверх холста, настоящими кнопками. Пока
// тут стоял нарисованный ряд заглушек, он проступал сквозь настоящий — две полосы на одном месте.
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
  function draw(canvas, { W, H, top, people, pile = 0 }) {
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

    // НА СТОЛЕ — ОДНА СТОПКА. Карта, вынесенная из чьей-то руки, ложится сюда, и стопка растёт:
    // жест обязан куда-то приехать, иначе карта пропадает в надписи.
    const cw = Math.round(W * 0.17), ch = Math.round(cw * 1.45);
    for (let i = 0; i <= pile; i += 1) {
      const dx = cx - cw / 2 + i * 3, dy = cy - ch / 2 - i * 3;
      box(g, dx, dy, cw, ch, 6);
      g.fillStyle = T.ink; g.fill();
      g.lineWidth = 2; g.strokeStyle = T.black; g.stroke();
      box(g, dx + 5, dy + 5, cw - 10, ch - 10, 4);
      g.fillStyle = "#9c2f2a"; g.fill();
    }

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

    return spots;
  }

  window.Felt = { T, PALETTE, draw };
})();
