// СВЯЗКА — гироскоп держит поворот, метка говорит только, куда телефон сместился.
//
// Метка по кадру даёт полную позу, но поворот из неё дрожит и опаздывает: трекер видит кадр раз в
// 60–100 мс и сглаживает в кадре камеры, где стол летит при каждом повороте руки. Гироскоп поворот
// знает точно и без опоздания, но про шаги не знает ничего. Поэтому:
//
//   • поворот камеры — только гироскоп, всегда, в том числе когда метки не видно;
//   • ЯКОРЬ стоит в МИРЕ — он не двигается, двигается телефон. Якорь — плоскость метки как она есть
//     (картина на стене — якорь на стене) или, с `flat`, плашмя по гравитации с курсом метки;
//   • каждый кадр трекера — одно измерение «где телефон»: стол − поворот(гиро в миг кадра) · метка;
//   • фильтр сидит на этом измерении, в мире: стоишь — точка стоит, и её можно гладить сильно, не
//     опаздывая к повороту руки (поворот сюда не входит);
//   • метка пропала — телефон остаётся там, где его видели в последний раз, стол держит гироскоп;
//   • скачок дальше `gate` — выброс, пока `jumpFrames` кадров подряд не скажут то же самое (тогда
//     это не выброс, а ты прошёл, пока метки не было);
//   • метка, повёрнутая против якоря дальше `maxTurn`, — тоже выброс, по тем же правилам: трекер
//     ошибся, или метку правда переложили (тогда `jumpFrames` кадров подряд — и якорь переложен);
//   • поворот якоря подтягивается к метке. Первые `settle` кадров — целиком, усреднением: так гасится
//     шум первого кадра. Дальше — только курс, по `turnGain`: гироскоп теряет лишь курс, а вниз
//     смотрит верно всегда; наклон же метки врёт, когда она у края кадра, и тянуть за ним стол — значит
//     качать его при каждом шаге.
//
// Чистая математика: кватернионы [x, y, z, w], векторы [x, y, z], время в мс. Единица длины — ширина
// метки (как в pose.js).

export const FUSE = {
  gate: 1.5,
  jumpFrames: 4,
  maxTurn: 25,
  turnGain: 0.05,
  settle: 15,
  minCutoff: 0.15,
  beta: 0.3,
  glideMs: 120,
};

// ─── кватернионы ──────────────────────────────────────────────────────────────────────────────────
export function qmul([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export const qconj = ([x, y, z, w]) => [-x, -y, -z, w];

export function rotate([qx, qy, qz, qw], [vx, vy, vz]) {
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  return [vx + qw * tx + (qy * tz - qz * ty), vy + qw * ty + (qz * tx - qx * tz), vz + qw * tz + (qx * ty - qy * tx)];
}

export function slerp(a, b, k) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  d *= s;
  if (d > 0.9995) {
    const q = a.map((v, i) => v + (s * b[i] - v) * k);
    const n = Math.hypot(...q);
    return q.map((v) => v / n);
  }
  const th = Math.acos(d), sn = Math.sin(th);
  const ka = Math.sin((1 - k) * th) / sn, kb = (s * Math.sin(k * th)) / sn;
  return a.map((v, i) => v * ka + b[i] * kb);
}

/** Стол лёжа (нормаль +Y) с курсом `yaw`: ось X стола смотрит в (cos yaw, 0, −sin yaw). */
export function levelQ(yaw) {
  return qmul([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
}

/** Угол между двумя поворотами, радианы. */
export const qangle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));

/** Доля `k` курсовой части поворота `q` (поворот вокруг вертикали мира). */
function yawOnly(q, k) {
  const a = 2 * Math.atan2(q[1], q[3]) * k;
  return [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
}

/** Поворот плашмя с курсом оси X поворота `q`. */
export function flatten(q) {
  const ax = rotate(q, [1, 0, 0]);
  return levelQ(Math.atan2(-ax[2], ax[0]));
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ─── память гироскопа ─────────────────────────────────────────────────────────────────────────────
/**
 * Повороты телефона за последнюю секунду. Кадр видео и кадр трекера — из прошлого; поворот к ним
 * берётся тот, что был тогда, а не нынешний, иначе при повороте руки стол едет мимо кадра.
 */
export function gyroTrack(keepMs = 1000) {
  const list = [];
  return {
    push(t, q) {
      list.push({ t, q });
      while (list.length > 2 && list[0].t < t - keepMs) list.shift();
    },
    at(t) {
      if (!list.length) return null;
      if (t <= list[0].t) return list[0].q;
      for (let i = list.length - 1; i > 0; i -= 1) {
        const b = list[i], a = list[i - 1];
        if (t >= a.t) return t >= b.t ? b.q : slerp(a.q, b.q, (t - a.t) / (b.t - a.t));
      }
      return list.at(-1).q;
    },
    get size() { return list.length; },
  };
}

// ─── фильтр «одного евро» в мире ──────────────────────────────────────────────────────────────────
function oneEuro(opts) {
  let x = null, dx = [0, 0, 0], at = 0;
  const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  return {
    reset(to, t) { x = to.slice(); dx = [0, 0, 0]; at = t; },
    step(v, t) {
      if (!x) { this.reset(v, t); return x; }
      const dt = Math.max(1e-3, (t - at) / 1000);
      at = t;
      const raw = sub(v, x).map((d) => d / dt);
      const ad = alpha(1, dt);
      dx = dx.map((d, i) => d + (raw[i] - d) * ad);
      const a = alpha(opts().minCutoff + opts().beta * Math.hypot(...dx), dt);
      x = x.map((p, i) => p + (v[i] - p) * a);
      return x;
    },
  };
}

// ─── связка ───────────────────────────────────────────────────────────────────────────────────────
/**
 * `opts` — функция, а не объект: ручки стенда меняются на лету.
 * Возвращает, что стало с измерением: 'lock' | 'ok' | 'jump' | 'held' (выброс).
 */
export function createFusion(opts = () => FUSE) {
  const S = { locked: false, anchor: { pos: [0, 0, 0], q: [0, 0, 0, 1] }, cam: [0, 0, 0], shown: [0, 0, 0], pending: [], taken: 0, seenAt: -Infinity, last: null };
  const filter = oneEuro(opts);

  function measure(qCam, t, qMarker, now) {
    const o = opts();
    const w = rotate(qCam, t);
    const qm = qmul(qCam, qMarker);
    const q = o.flat ? flatten(qm) : qm;
    S.seenAt = now;

    if (!S.locked) {
      S.locked = true;
      S.anchor = { pos: w, q };
      S.cam = [0, 0, 0]; S.shown = [0, 0, 0];
      filter.reset(S.cam, now);
      S.pending = []; S.taken = 1;
      return (S.last = "lock");
    }

    const at = sub(S.anchor.pos, w);
    const turn = (o.maxTurn * Math.PI) / 180;
    if (dist(at, S.cam) > o.gate || qangle(q, S.anchor.q) > turn) {
      const prev = S.pending.at(-1);
      const same = prev && dist(prev.at, at) <= o.gate && qangle(prev.q, q) <= turn;
      S.pending = same ? [...S.pending, { at, q }] : [{ at, q }];
      if (S.pending.length < o.jumpFrames) return (S.last = "held");
      // Метку переложили или ты прошёл, пока её не было: якорь встаёт по свежей метке там же, где
      // был, — поворачивается якорь, телефон остаётся в своей точке мира.
      S.pending = [];
      S.anchor.q = q;
      S.cam = sub(S.anchor.pos, w);
      filter.reset(S.cam, now);
      return (S.last = "jump");
    }
    S.pending = [];
    S.cam = filter.step(at, now);
    S.taken += 1;
    if (S.taken <= o.settle) S.anchor.q = slerp(S.anchor.q, q, 1 / S.taken);
    else S.anchor.q = qmul(yawOnly(qmul(q, qconj(S.anchor.q)), o.turnGain), S.anchor.q);
    return (S.last = "ok");
  }

  /** Кадр экрана: показанная точка догоняет измеренную — ступеньки трекера 10–15 к/с не видны. */
  function frame(dtMs) {
    const k = 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, opts().glideMs));
    S.shown = S.shown.map((p, i) => p + (S.cam[i] - p) * k);
    return S.shown;
  }

  function reset() {
    S.locked = false; S.pending = []; S.taken = 0; S.cam = [0, 0, 0]; S.shown = [0, 0, 0]; S.last = null;
  }

  return { S, measure, frame, reset };
}
