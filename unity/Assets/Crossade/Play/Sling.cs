// РОГАТКА — бросок карты из руки в центр камеры, числа веба (`sling.ts`, `SLING` в `screenConst.ts`):
//
//   палец вышел под карту   — карта не едет за ним, стоит на месте; заряд растёт тем быстрее, чем дальше палец;
//   заряжена                — стрелка дотянулась до центра камеры, на сукне контур: отпустишь — улетит;
//   отпустил заряженную     — бросок (`drop` с `throw`), если цель на сукне; мимо — отказ, карта на месте;
//   отпустил раньше         — отмена; вернул палец на карту — обычный перенос.
//
// Расстояния — в пикселях веба.

using System;

namespace Crossade.Play
{
    public static class Sling
    {
        public const double Rate0 = .6, RatePx = 1 / 70.0, Spring = 14, SpringPx = 40, Edge = .8;

        public static bool Tensed(double dist) => dist > 0;

        public static double Charged(double charge, double dist, double dt)
        {
            if (!Tensed(dist) || dt <= 0) return Math.Max(0, Math.Min(1, charge));
            return Math.Min(1, charge + dt * (Rate0 + dist * RatePx));
        }

        public static double SpringOf(double dist) => Spring * (1 - Math.Exp(-Math.Max(0, dist) / SpringPx));

        public enum Release { Throw, Refuse, Cancel }

        public static Release OnRelease(bool armed, bool valid) => !armed ? Release.Cancel : valid ? Release.Throw : Release.Refuse;
    }
}
