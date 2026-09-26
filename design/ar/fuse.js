// СВЯЗКА — гироскоп держит поворот, метка говорит только, куда телефон сместился.
//
// Метка по кадру даёт полную позу, но поворот из неё дрожит и опаздывает: трекер видит кадр раз в
// 60–100 мс и сглаживает в кадре камеры, где стол летит при каждом повороте руки. Гироскоп поворот
// знает точно и без опоздания, но про шаги не знает ничего. Поэтому:
//
//   • поворот камеры — только гироскоп, всегда, в том числе когда метки не видно;
//   • стол стоит в МИРЕ (лёжа, курс `yaw`) — он не двигается, двигается телефон;
//   • каждый кадр трекера — одно измерение «где телефон»: стол − поворот(гиро в миг кадра) · метка;
//   • фильтр сидит на этом измерении, в мире: стоишь — точка стоит, и её можно гладить сильно, не
//     опаздывая к повороту руки (поворот сюда не входит);
//   • метка пропала — телефон остаётся там, где его видели в последний раз, стол держит гироскоп;
//   • скачок дальше `gate` — выброс, пока `jumpFrames` кадров подряд не скажут то же самое (тогда
//     это не выброс, а ты прошёл, пока метки не было);
//   • метка, которая лежит не плашмя (нормаль дальше `maxTilt` от вертикали), — трекер ошибся;
//   • курс стола медленно подтягивается к курсу метки — это и уход гироскопа по курсу, и шум
//     первого кадра. Первые кадры усредняются, дальше — `yawGain`.
//
// Чистая математика: кватернионы [x, y, z, w], векторы [x, y, z], время в мс. Единица длины — ширина
// метки (как в pose.js).

export const FUSE = {
  gate: 1.5,
  jumpFrames: 4,
  maxTilt: 35,
  yawGain: 0.05,
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

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
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
 * Возвращает, что стало с измерением: 'lock' | 'ok' | 'jump' | 'held' (выброс) | 'tilt'.
 */
export function createFusion(opts = () => FUSE) {
  const S = { locked: false, table: { pos: [0, 0, 0], yaw: 0 }, cam: [0, 0, 0], shown: [0, 0, 0], pending: [], taken: 0, seenAt: -Infinity, last: null };
  const filter = oneEuro(opts);

  function measure(qCam, t, qMarker, now) {
    const o = opts();
    const w = rotate(qCam, t);
    const qm = qmul(qCam, qMarker);
    const n = rotate(qm, [0, 0, 1]);
    if (n[1] < Math.cos((o.maxTilt * Math.PI) / 180)) return (S.last = "tilt");
    const ax = rotate(qm, [1, 0, 0]);
    const yaw = Math.atan2(-ax[2], ax[0]);
    S.seenAt = now;

    if (!S.locked) {
      S.locked = true;
      S.table = { pos: w, yaw };
      S.cam = [0, 0, 0]; S.shown = [0, 0, 0];
      filter.reset(S.cam, now);
      S.pending = []; S.taken = 1;
      return (S.last = "lock");
    }

    const at = sub(S.table.pos, w);
    if (dist(at, S.cam) > o.gate) {
      const prev = S.pending.at(-1);
      S.pending = prev && dist(prev, at) <= o.gate ? [...S.pending, at] : [at];
      if (S.pending.length < o.jumpFrames) return (S.last = "held");
      S.pending = [];
      filter.reset(at, now);
      S.cam = at;
      return (S.last = "jump");
    }
    S.pending = [];
    S.cam = filter.step(at, now);
    S.taken += 1;
    S.table.yaw = wrap(S.table.yaw + wrap(yaw - S.table.yaw) * Math.max(o.yawGain, 1 / S.taken));
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
