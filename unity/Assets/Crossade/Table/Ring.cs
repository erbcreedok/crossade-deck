// МЕСТА ЗА КРУГЛЫМ СТОЛОМ И КРУГ ХОДА — `server/src/table/ring.ts`, те же числа. Единица — ширина
// карты; +y — к своей стороне (вниз экрана веба); углы стульев — от шести часов, против часовой на экране.

using System;
using System.Collections.Generic;

namespace Crossade.Table
{
    public static class Ring
    {
        public const double TableRadius = 6.4;
        public const double SeatRadius = TableRadius * 0.875;
        public const double CroupierRadius = TableRadius + 0.2;
        public const double DeckRadius = TableRadius * 0.675;
        public const double Spread = 3;
        public const double CardW = 1, CardH = 1.4, Apart = 1.15;
        public const double Lay = Spread - CardH / 2;
        public const double Hour = 30;

        public static (double x, double y) SeatPoint(double angle, double radius = SeatRadius)
        {
            var t = angle * Math.PI / 180;
            return (Math.Sin(t) * radius, Math.Cos(t) * radius);
        }

        public static double CardStep() => Math.Asin(Math.Min(1, CardW * Apart / 2 / Lay)) * 360 / Math.PI;

        static double Norm(double a) => ((a % 360) + 360) % 360;

        static double Near(double a, double b)
        {
            var away = Math.Abs(((a - b) % 360 + 540) % 360 - 180);
            return Math.Min(away, 360 - away);
        }

        /** Куда ляжет карта круга, отпущенная на этом угле: свободно — сюда, занято — рядом. */
        public static double Landing(double turn, IReadOnlyList<double> busy)
        {
            var hour = Norm(turn);
            var step = CardStep();
            bool Free(double at)
            {
                foreach (var one in busy) if (Near(one, at) < step) return false;
                return true;
            }
            if (Free(hour)) return hour;
            for (var away = step; away <= 180; away += step / 2)
                foreach (var side in new[] { 1, -1 })
                {
                    var place = Norm(hour + side * away);
                    if (Free(place)) return place;
                }
            return hour;
        }

        /** Точка на кольце под углом `turn` (от севера стола). */
        public static (double x, double y) Spot(double ax, double ay, double turn, double spread)
        {
            var rad = turn * Math.PI / 180;
            return (ax + spread * Math.Sin(rad), ay - spread * Math.Cos(rad));
        }

        /** Карта круга смотрит верхом к середине. */
        public static double Face(double turn)
        {
            var d = Norm(turn + 180 + 180) - 180;
            return d == -180 ? 180 : d;
        }

        /** Угол точки от середины стола — по нему пустой круг выбирает якорь. */
        public static double TurnOfPlace(double x, double y) => Norm(Math.Atan2(x, -y) * 180 / Math.PI);
    }
}
