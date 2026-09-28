// ГЕОМЕТРИЯ МОЕЙ РУКИ — `server/table-client/handGeom.ts` на C#, те же числа (`screenConst.ts`). Сверяется с
// вебом эталоном (`HandGeomTests`, пишет `table-client/handFixture.test.ts`).
//
// Оси — как у веба: пиксели стекла, y ВНИЗ от верхнего края. Экран Unity переворачивает y сам.

using System;
using Crossade.Wire;

namespace Crossade.Table
{
    public struct Slot
    {
        public double X, Y, Angle;
    }

    /** Поза под пальцем: `Wide` 0 — стопкой, 1 — широко; `Lift` 0 — спрятана, 0.5 — веер, 1 — ряд. */
    public struct PoseBlend
    {
        public double Wide, Lift;
    }

    public sealed class HandBox
    {
        public double U, Scale, Wide, BarTop, Mid, Shown;
        public Slot[] Plan;
    }

    public sealed class HandGeomOut
    {
        public double W, H, BarTop;
        public Slot[] Slots;
    }

    public static class HandGeom
    {
        // screenConst.ts
        public const double BarSize = .6, BarGap = .08, BarMargin = .22, BarPad = .11, BarTuck = .24;
        const double FanRadius = 7, FanApart = 1.06, FanEdge = .1;
        const int HudCards = 6;
        const double HudGap = .06, HudMargin = .14, HandPad = .16, TuckTip = .45;
        const double HandRoom = .6 / 4 + .06;
        const double UnitFraction = .25;
        static readonly double UnitMax = Math.Round(390 * UnitFraction * 1.15, MidpointRounding.AwayFromZero);
        const double HeightShare = 390 * UnitFraction / 844;
        const double HandMaxPx = 585;
        const double CardW = 1, CardH = 1.4;

        static double Clamp01(double v) => Math.Max(0, Math.Min(1, v));
        /** `Math.round` у JS: половинка — вверх. */
        static double JsRound(double v) => Math.Floor(v + .5);

        public static double UnitOf(double w, double h) => Math.Max(1, JsRound(Math.Min(UnitMax, Math.Min(Math.Min(w, h) * UnitFraction, h * HeightShare))));
        public static double HandWideOf(double w) => Math.Min(w, HandMaxPx);
        public static double BarHeightU => BarSize + 2 * BarPad;

        public static Slot[] Plan(HandPose pose, int n, double w, double h, double roomU)
        {
            var o = new Slot[n];
            if (pose.Shrink) return o;
            var apart = FanApart * w;
            var mid = (n - 1) / 2.0;
            if (!pose.Fan)
            {
                var step0 = n > 1 ? Math.Min(apart, Math.Max(0, roomU - 2 * (w / 2 + FanEdge * w)) / (n - 1)) : 0;
                for (int i = 0; i < n; i++) o[i] = new Slot { X = (i - mid) * step0 };
                return o;
            }
            var R = FanRadius * h;
            double Deg(double rad) => rad * 180 / Math.PI;
            var most = Deg(2 * Math.Asin(Math.Min(1, apart / (2 * R))));
            double step = 0;
            if (n > 1)
            {
                var reach = w / 2;
                for (int pass = 0; pass < 3; pass++)
                {
                    var chord = Math.Max(0, Math.Min(1, (roomU - 2 * (reach + FanEdge * w)) / (2 * R)));
                    step = Math.Min(most, Deg(2 * Math.Asin(chord)) / (n - 1));
                    var outer = step * (n - 1) / 2 / 180 * Math.PI;
                    reach = w / 2 * Math.Cos(outer) + h / 2 * Math.Sin(outer);
                }
            }
            for (int i = 0; i < n; i++)
            {
                var angle = (i - mid) * step;
                var rad = angle * Math.PI / 180;
                o[i] = new Slot { X = R * Math.Sin(rad), Y = R * (1 - Math.Cos(rad)), Angle = angle };
            }
            return o;
        }

        public static PoseBlend BlendOf(HandPose p) => new() { Wide = p.Shrink ? 0 : 1, Lift = p.Tuck ? 0 : p.Shrink || !p.Fan ? 1 : .5 };

        public static HandPose Snap(PoseBlend b, HandPose was)
        {
            var wide = b.Wide >= .5;
            var lift = wide ? (b.Lift < .25 ? 0 : b.Lift < .75 ? .5 : 1) : b.Lift < .5 ? 0 : 1;
            return new HandPose { Fan = wide && lift > 0 ? lift == .5 : was.Fan, Shrink = !wide, Tuck = lift == 0 };
        }

        static double TuckOf(PoseBlend b) => Clamp01(1 - b.Lift / .5);

        public static Slot[] PlanBlend(PoseBlend b, bool fanBelow, int n, double w, double h, double roomU)
        {
            var fanAmt = b.Lift >= .5 ? Clamp01(2 * (1 - b.Lift)) : fanBelow ? 1 : 0;
            var wide = Clamp01(b.Wide);
            var fan = Plan(new HandPose { Fan = true }, n, w, h, roomU);
            var row = Plan(new HandPose { Fan = false }, n, w, h, roomU);
            var o = new Slot[n];
            for (int i = 0; i < n; i++)
            {
                var f = fan[i];
                var r = row[i];
                o[i] = new Slot
                {
                    X = (r.X + (f.X - r.X) * fanAmt) * wide,
                    Y = (r.Y + (f.Y - r.Y) * fanAmt) * wide,
                    Angle = (r.Angle + (f.Angle - r.Angle) * fanAmt) * wide,
                };
            }
            return o;
        }

        public static HandBox Box(double gw, double gh, HandPose pose, int count, PoseBlend? blend = null, double lift = 0)
        {
            var u = UnitOf(gw, gh);
            var room = HandWideOf(gw) / u - 2 * HudMargin;
            var scale = Math.Min(1, room / (HudCards * CardW * (1 + HudGap)));
            var wide = Math.Max(1, HandWideOf(gw) / u / scale);
            var plan = blend is { } b ? PlanBlend(b, pose.Fan, count, CardW, CardH, wide) : Plan(pose, count, CardW, CardH, wide);
            double drop = 0;
            foreach (var p in plan) drop = Math.Max(drop, p.Y);
            var high = CardH + drop + 2 * HandPad + HandRoom;
            var barTop = gh - lift - BarHeightU * u;
            var t = blend is { } b2 ? TuckOf(b2) : pose.Tuck ? 1 : 0;
            var up = Math.Max(0, (high - HandRoom) * scale - BarTuck);
            var shown = up + (TuckTip - up) * t;
            var cardsBottom = barTop + BarTuck * u + t * Math.Max(0, (high - HandRoom) * scale * u - TuckTip * u);
            var mid = cardsBottom + (HandRoom - high / 2) * scale * u;
            return new HandBox { U = u, Scale = scale, Wide = wide, Plan = plan, BarTop = barTop, Mid = mid, Shown = shown };
        }

        public static HandGeomOut Mine(double gw, double gh, HandPose pose, int count, PoseBlend? blend = null, double lift = 0)
        {
            var box = Box(gw, gh, pose, count, blend, lift);
            var slots = new Slot[box.Plan.Length];
            for (int i = 0; i < slots.Length; i++)
            {
                var p = box.Plan[i];
                slots[i] = new Slot { X = gw / 2 + p.X * box.Scale * box.U, Y = box.Mid + p.Y * box.Scale * box.U, Angle = p.Angle };
            }
            return new HandGeomOut { W = CardW * box.Scale * box.U, H = CardH * box.Scale * box.U, BarTop = box.BarTop, Slots = slots };
        }
    }
}
