// СТОЛ ПО НАСТОЯЩИМ ПРАВИЛАМ — холст под разметкой: сукно, кромка, стулья, диски и карты в стульях.
//
// ОТЛИЧИЕ ОТ `/table` В ОДНОМ, И ОНО ГЛАВНОЕ: там места нарисованы «как удобно стенду» — цветные
// кружки по дуге. Здесь всё до последнего числа взято из продукта: арка стула, диск в ней, табличка
// с именем, лесенка карт у правой руки — теми же единицами и теми же долями, что рисует движок. Этот
// стенд заводится ради ЖЕСТА (бросок, контур, реордер), а жест — это геометрия: стенд, у которого
// карта другого размера и стул другой формы, отвечает не на тот вопрос, который ему задают.
//
// ЕДИНИЦА — ШИРИНА КАРТЫ НА СУКНЕ, ровно как в движке. Всё ниже в ней, а `U` переносит на стекло.

(function () {
  /** Цвета стула — содержание, а не тема (`SEAT_LOOK` в `seatPlace.ts`). */
  const SEAT = {
    black: "#0b0704",
    gold: "#f2c14e",
    ink: "#f5ead0",
    woodHi: "#6b4d2c",
    woodLo: "#1d1409",
    cream: "#cdb98f",
    discHi: "#3d4a3a",
    discLo: "#1b2418",
  };

  /** Цвета стола (`ROUND_LOOK` в `roundMap.ts`). */
  const ROUND = {
    feltHi: "#1b4835",
    feltMid: "#123527",
    feltLo: "#0a2117",
    black: "#0b0704",
    woodDark: "#3a2a1d",
    woodLight: "#6b4d2c",
    edge: "#f2c14e",
  };

  /** Стол: радиус сукна и три кольца кромки (`ROUND_R`, `ROUND_EDGE`). */
  const R = 8;
  const EDGE = { line: 0.09, dark: 0.33, light: 0.18 };
  const RIM = EDGE.line + EDGE.dark + EDGE.light;
  /** Во сколько стёкол шириной стол открывается (`ROUND_HOME_SPAN`). */
  const HOME_SPAN = 1.5;

  /** Стул: арка и её линия (`ARCH_R`, `CHAIR.line`). */
  const ARCH_R = 1.1;
  const CHAIR_LINE = 0.09;
  /** Диск и табличка под ним (`DISC`, `LINE`, `PLATE` в `presence.ts`). */
  const DISC = 1.6;
  const DISC_LINE = 0.09;
  const PLATE = { at: 1.34, padX: 0.24, padY: 0.09, line: 0.06 };
  const PLATE_EM = 0.24;
  const GLYPH_EM = 0.5;

  /** Карта в стуле: её доля от карты на сукне и её поза (`HAND_SCALE`, `POSE`). */
  const HAND_SCALE = 0.55;
  const POSE = {
    sideIn: 0.35,
    sideDrop: 0.2,
    tip: 0.25,
    fanIn: 0.17,
    fan: { spread: 60, radius: 2 },
    fanShut: { spread: 14, radius: 2 },
    ladder: { room: 2.2, gapMin: 0.08, gapMax: 0.55 },
  };

  /** Карта на сукне — одна единица в ширину (`roundMap`'s own card). */
  const CARD = { w: 1, h: 1.4 };

  /**
   * ПОРЯДОК РАЗРЕЗАНИЯ ПИЦЦЫ (`ringOrder`): своя сторона, напротив, слева, справа, дальше пополам.
   * Здесь нужны только первые несколько, но правило то же, и выдумывать второе нельзя.
   */
  function ringOrder(levels = 8) {
    const out = [0, 180];
    for (let k = 2; k <= levels; k += 1) {
      const step = 360 / 2 ** k;
      const fresh = [];
      for (let i = 0; i < 2 ** k; i += 1) {
        const a = (i * step) % 360;
        if (!out.includes(a) && !fresh.includes(a)) fresh.push(a);
      }
      fresh.sort((a, b) => {
        const near = Math.min(a, 360 - a) - Math.min(b, 360 - b);
        return near !== 0 ? near : b - a;
      });
      const left = new Set(fresh);
      for (const a of fresh) {
        if (!left.has(a)) continue;
        left.delete(a);
        out.push(a);
        const across = (a + 180) % 360;
        if (left.delete(across)) out.push(across);
      }
    }
    return out;
  }

  /** Точка на круге (`ringSpot`) — те же оси: +y к себе, вниз экрана. */
  function ringSpot(angle, radius) {
    const t = (angle * Math.PI) / 180;
    return { at: { x: Math.sin(t) * radius, y: Math.cos(t) * radius }, facing: angle };
  }

  function ringPlaces(n, radius) {
    return ringOrder().slice(0, Math.max(0, n)).map((a) => ringSpot(a, radius));
  }

  /** Веер из `poses.fan` — тот же, которым раскладывается и рука в стуле, и рука на стекле. */
  function fanPoses(n, { spread, radius }) {
    return Array.from({ length: n }, (_, i) => {
      const angle = n < 2 ? 0 : -spread / 2 + (spread * i) / (n - 1);
      const rad = (angle * Math.PI) / 180;
      return { at: { x: radius * Math.sin(rad), y: radius * (1 - Math.cos(rad)) }, angle };
    });
  }

  /** Шаг лесенки: столько, сколько влезает в отведённую комнату, но не шире `gapMax` (`fitStep`). */
  function fitStep(n, room, look) {
    if (n < 2) return 0;
    return Math.max(look.gapMin, Math.min(look.gapMax, room / (n - 1)));
  }

  /**
   * ГДЕ ЛЕЖИТ КАЖДАЯ КАРТА РУКИ В СТУЛЕ (`posePlan`) — в системе самого стула, где +y сторона
   * хозяина, -y стол. Поза по умолчанию — лесенка у правой руки.
   */
  function posePlan(pose, n) {
    const s = HAND_SCALE;
    const w = CARD.w * s;
    const h = CARD.h * s;
    if (!pose.fan) {
      const y = POSE.sideDrop * h;
      const near = ARCH_R - POSE.sideIn;
      if (pose.tuck) return Array.from({ length: n }, () => ({ at: { x: ARCH_R + POSE.tip * w - w / 2, y }, angle: 0 }));
      if (pose.shrink) {
        // Плотная стопка: тот же снос, поделённый на всю пачку (`stack`).
        const drift = { x: 0.03, y: -0.03 };
        const reach = 0.03 * Math.max(0, n - 1);
        const k = reach > 0.18 ? 0.18 / reach : 1;
        return Array.from({ length: n }, (_, i) => ({
          at: { x: near + w / 2 + i * drift.x * k * s, y: y + i * drift.y * k * s },
          angle: 0,
        }));
      }
      const step = fitStep(n, POSE.ladder.room * s, POSE.ladder) * s;
      return Array.from({ length: n }, (_, i) => ({ at: { x: near + w / 2 + step * i, y }, angle: 0 }));
    }
    if (pose.tuck) return Array.from({ length: n }, () => ({ at: { x: 0, y: -(ARCH_R + POSE.tip * h) + h / 2 }, angle: 0 }));
    const middle = -(ARCH_R - POSE.fanIn * h) - h / 2;
    return fanPoses(n, pose.shrink ? POSE.fanShut : POSE.fan).map((p) => ({
      at: { x: p.at.x * s, y: middle + p.at.y * s },
      angle: p.angle,
    }));
  }

  /** Арка: полукруг спереди (-y, в стол) и плоская спинка сзади (+y, где сидит хозяин). */
  function archPath(g, r) {
    const k = 0.5523 * r;
    g.beginPath();
    g.moveTo(-r, 0);
    g.bezierCurveTo(-r, -k, -k, -r, 0, -r);
    g.bezierCurveTo(k, -r, r, -k, r, 0);
    g.lineTo(r, r);
    g.lineTo(-r, r);
    g.closePath();
  }

  function roundRect(g, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }

  const SUITS = { s: ["♠", "#1b1b1b"], h: ["♥", "#9c2f2a"], d: ["♦", "#9c2f2a"], c: ["♣", "#1b1b1b"] };

  /** Карта, нарисованная в единицах: лицом — знак и ранг, рубашкой — плетёнка. */
  function card(g, c, shown, w, h) {
    roundRect(g, -w / 2, -h / 2, w, h, w * 0.12);
    g.fillStyle = shown ? "#f5ead0" : "#4a3627";
    g.fill();
    g.lineWidth = w * 0.05;
    g.strokeStyle = SEAT.black;
    g.stroke();
    if (!shown) {
      g.save();
      g.clip();
      g.strokeStyle = "#6b4d2c";
      g.lineWidth = w * 0.05;
      for (let i = -h; i < w + h; i += w * 0.16) {
        g.beginPath();
        g.moveTo(-w / 2 + i, -h / 2);
        g.lineTo(-w / 2 + i + h, h / 2);
        g.stroke();
      }
      g.restore();
      return;
    }
    const [sign, colour] = SUITS[c.suit];
    g.fillStyle = colour;
    g.textAlign = "left";
    g.textBaseline = "top";
    g.font = `${w * 0.3}px Tiny5, monospace`;
    g.fillText(c.rank, -w / 2 + w * 0.1, -h / 2 + w * 0.06);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${w * 0.45}px Tiny5, monospace`;
    g.fillText(sign, 0, h * 0.05);
  }

  /** Диск с лицом или буквами и табличка с именем под ним — как их рисует `presence.ts`. */
  function disc(g, who, mine, images) {
    const r = DISC / 2;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = SEAT.black;
    g.fill();
    const inner = r - DISC_LINE;
    const picture = who.face ? images[who.face] : undefined;
    if (picture && picture.complete && picture.naturalWidth > 0) {
      g.save();
      g.beginPath();
      g.arc(0, 0, inner, 0, Math.PI * 2);
      g.clip();
      const side = inner * 2;
      g.drawImage(picture, -inner, -inner, side, side);
      g.restore();
    } else {
      const grad = g.createLinearGradient(0, -r, 0, r);
      grad.addColorStop(0, SEAT.discHi);
      grad.addColorStop(1, SEAT.discLo);
      g.beginPath();
      g.arc(0, 0, inner, 0, Math.PI * 2);
      g.fillStyle = grad;
      g.fill();
      g.fillStyle = SEAT.ink;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `${GLYPH_EM}px Tiny5, monospace`;
      g.fillText(initials(who.name), 0, GLYPH_EM * 0.08);
    }
    // РАМКА В ЦВЕТЕ ЧЕЛОВЕКА — внутри чёрной линии, как и у стула: диск в арке читается одной вещью.
    g.beginPath();
    g.arc(0, 0, inner, 0, Math.PI * 2);
    g.lineWidth = DISC_LINE;
    g.strokeStyle = who.ink;
    g.stroke();
    if (mine) {
      g.beginPath();
      g.arc(0, 0, r + DISC_LINE, 0, Math.PI * 2);
      g.lineWidth = DISC_LINE;
      g.strokeStyle = SEAT.gold;
      g.stroke();
    }
    // ТАБЛИЧКА: моноширинный шрифт, поэтому ширина — длина имени в кеглях.
    const w = Math.max(1, [...who.name].length * PLATE_EM + 2 * PLATE.padX);
    const h = PLATE_EM * 1.6 + 2 * PLATE.padY;
    roundRect(g, -w / 2, PLATE.at - h / 2, w, h, h * 0.3);
    g.fillStyle = SEAT.black;
    g.fill();
    g.lineWidth = PLATE.line;
    g.strokeStyle = who.ink;
    g.stroke();
    g.fillStyle = SEAT.ink;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${PLATE_EM}px Tiny5, monospace`;
    g.fillText(who.name, 0, PLATE.at);
  }

  /** Две буквы, а не одна: одна сталкивается на первом же соседе с тем же именем (`initials`). */
  function initials(name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => [...part][0])
      .join("")
      .toUpperCase();
  }

  /** Один стул: чёрная плашка, деревянная крышка с ободком в цвет, золотое кольцо у своего. */
  function chair(g, who, mine) {
    archPath(g, ARCH_R + CHAIR_LINE);
    if (mine) {
      g.fillStyle = SEAT.gold;
      g.fill();
    }
    archPath(g, ARCH_R);
    g.fillStyle = SEAT.black;
    g.fill();
    const grad = g.createLinearGradient(0, -ARCH_R, 0, ARCH_R);
    grad.addColorStop(0, SEAT.woodHi);
    grad.addColorStop(1, SEAT.woodLo);
    archPath(g, ARCH_R - CHAIR_LINE / 2);
    g.save();
    g.globalAlpha = 0.5;
    g.fillStyle = grad;
    g.fill();
    g.restore();
    g.lineWidth = CHAIR_LINE;
    g.strokeStyle = who.ink;
    g.stroke();
  }

  /** Пустое место: один пунктирный контур и больше ничего. */
  function emptyPlace(g) {
    archPath(g, ARCH_R);
    g.save();
    g.globalAlpha = 0.5;
    g.lineWidth = CHAIR_LINE;
    g.strokeStyle = SEAT.cream;
    g.setLineDash([0.24, 0.16]);
    g.stroke();
    g.restore();
  }

  /**
   * НАРИСОВАТЬ СТОЛ И ВЕРНУТЬ, ГДЕ ЧТО ЛЕЖИТ. Разметка сверху (тултипы) ставится ПО ЭТИМ числам, а
   * не по выдуманным: тултип, прицепленный к придуманной точке, показывает не на того человека.
   */
  function draw(canvas, o) {
    const { W, H, people, images, pile = 3 } = o;
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // СКОЛЬКО ПИКСЕЛЕЙ В ЕДИНИЦЕ.
    //
    // В ПРОДУКТЕ стол открывается шириной в полтора стекла (`ROUND_HOME_SPAN`), и места на трёх и
    // девяти часах честно уезжают за край — их достают камерой. У СТЕНДА КАМЕРЫ НЕТ, а оба бота
    // должны быть под пальцем: иначе тултип, ради которого стенд и заведён, некому открыть.
    //
    // Поэтому здесь своя посадка камеры, и она — единственное, чем стенд отличается от продукта:
    // видно весь круг мест вместе с дисками и табличками. Правила стола, стула и карт при этом те
    // же до последней доли; меняется только то, с какого расстояния на них смотрят.
    // Видно ВЕСЬ стол вместе с кромкой — а значит, и каждое место на нём. По меньшей из сторон
    // того, что от стекла осталось: стол, вписанный в одну ширину, на широком экране уезжает вниз
    // под руку, а вписанный в одну высоту — за края.
    const free = o.free ?? H;
    const U = o.span !== undefined ? (W * o.span) / (R * 2) : Math.min(W, free) / 2 / (R + RIM);
    // Центр стола по вертикали: свой стул стоит на радиусе (R-1) и должен уместиться над полосой
    // нижнего HUD, а дальняя кромка — не уехать под верхнюю. Это единственное число стенда, которое
    // подбиралось глазами, и оно про КАМЕРУ, а не про стол.
    const cy = o.centre ?? free / 2;

    g.fillStyle = ROUND.black;
    g.fillRect(0, 0, W, H);

    g.save();
    g.translate(W / 2, cy);
    g.scale(U, U);

    const ring = (radius, paint) => {
      g.beginPath();
      g.arc(0, 0, radius, 0, Math.PI * 2);
      g.fillStyle = paint;
      g.fill();
    };
    ring(R + RIM, ROUND.black);
    ring(R + EDGE.dark + EDGE.light, ROUND.woodDark);
    ring(R + EDGE.light, ROUND.woodLight);
    const felt = g.createRadialGradient(0, 0, 0, 0, 0, R);
    felt.addColorStop(0, ROUND.feltHi);
    felt.addColorStop(0.62, ROUND.feltMid);
    felt.addColorStop(1, ROUND.feltLo);
    ring(R, felt);

    // НА СТОЛЕ — ОДНА СТОПКА, ПО ЦЕНТРУ: жесту нужно куда-то бросать, и это она.
    for (let i = 0; i < pile; i += 1) {
      g.save();
      g.translate(i * 0.03, -i * 0.03);
      card(g, { suit: "s", rank: "A" }, false, CARD.w, CARD.h);
      g.restore();
    }

    // МЕСТА — ПО РАЗРЕЗАНИЮ ПИЦЦЫ, на радиусе (R - 1), ровно как их кладёт `cardsSpec`.
    const places = ringPlaces(Math.max(people.length, o.chairs ?? people.length), R - 1);
    const spots = [];
    places.forEach((place, i) => {
      const who = people[i];
      g.save();
      g.translate(place.at.x, place.at.y);
      // СТУЛ ПОВЁРНУТ ЛИЦОМ К СТОЛУ: круглая сторона арки всегда смотрит в середину.
      //
      // Угол берётся со знаком минус: у мест он отсчитывается от своего края (шесть часов) в сторону
      // +x, а холст крутит по часовой от +x. На шести и двенадцати часах разницы нет, и потому она
      // ловится только на трёх и девяти — где стул иначе садится к столу спиной.
      g.rotate((-place.facing * Math.PI) / 180);
      if (!who) {
        emptyPlace(g);
        g.restore();
        return;
      }
      chair(g, who, who.mine === true);
      // КАРТЫ В СТУЛЕ — В ЕГО СОБСТВЕННОЙ СИСТЕМЕ, и потому едут вместе с поворотом стула.
      const plan = posePlan(who.pose ?? { fan: false, shrink: false, tuck: false }, who.cards ?? 0);
      plan.forEach((p, k) => {
        g.save();
        g.translate(p.at.x, p.at.y);
        g.rotate((p.angle * Math.PI) / 180);
        // ЧУЖАЯ РУКА В СТУЛЕ — ВСЕГДА РУБАШКОЙ: карты у места это ИНДИКАТОР руки, а не сама рука.
        card(g, who.hand?.[k] ?? { suit: "s", rank: "A" }, false, CARD.w * HAND_SCALE, CARD.h * HAND_SCALE);
        g.restore();
      });
      g.restore();

      // ДИСК НЕ ПОВЁРНУТ ВМЕСТЕ СО СТУЛОМ: лицо человека смотрит на того, кто глядит на стол, —
      // диск живёт от КАМЕРЫ смотрящего, а не от кресла (`presence.ts`).
      g.save();
      g.translate(place.at.x, place.at.y);
      disc(g, who, who.mine === true, images);
      g.restore();
      spots.push({ key: who.key, x: W / 2 + place.at.x * U, y: cy + place.at.y * U, r: (DISC / 2) * U });
    });

    g.restore();
    return { spots, U, centre: { x: W / 2, y: cy } };
  }

  window.Felt = { SEAT, ROUND, R, RIM, ARCH_R, DISC, CARD, HAND_SCALE, HOME_SPAN, draw, ringPlaces, fanPoses, posePlan, card, initials };
})();
