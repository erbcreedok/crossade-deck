// МОЯ РУКА — карты у нижнего края экрана, разложенные ровно как у веба (`Table/HandGeom.cs`, порт
// `handGeom.ts`): веер, ряд, стопка, спрятана — по позе, которую видят все (`HandPose`), а пока палец
// тянет ручку позы — по позе под пальцем (`PoseBlend`).
//
// Рука висит на камере: куда ни поверни стол, она на месте, как худ у веба.

using System;
using Crossade.Table;
using Crossade.Wire;
using UnityEngine;

namespace Crossade.View
{
    public sealed class HandRig : MonoBehaviour
    {
        /**
         * КАК ДАЛЕКО ОТ ГЛАЗА ВИСЯТ КАРТЫ РУКИ: ближе стола, дальше худа. В обычном виде стол в десятках
         * метров — хватает трёх; в AR стол в полуметре, и рука жмётся к самому стеклу, иначе стол её закроет.
         * На экране рука одного размера при любой глубине: она масштабируется по ней же (`Metre`).
         */
        public const float FarDepth = 3f, NearDepth = .08f;
        public float Depth { get; private set; } = FarDepth;

        Camera cam;
        public Chair Chair { get; private set; }
        /** Где лежит i-я карта на экране (пиксели Unity, y вверх) — для жестов. */
        public Rect[] Slots = Array.Empty<Rect>();
        /** Угол i-й карты на экране, градусы по часовой — как у веба. */
        public float[] Angles = Array.Empty<float>();
        /** Верх полосы худа от низа экрана, пиксели. */
        public float BarPx { get; private set; } = 160;
        /** Поза под пальцем (ручка позы); `null` — поза стола. */
        public PoseBlend? Blend;
        /** Сколько пикселей экрана в пикселе веба. */
        public float Dpr { get; private set; } = 2;

        public static HandRig Make(Camera cam)
        {
            var rig = new GameObject("Hand").AddComponent<HandRig>();
            rig.cam = cam;
            rig.transform.SetParent(cam.transform, false);
            rig.Measure();
            return rig;
        }

        /** Рука переезжает на другую камеру (AR и обратно). */
        public void Retarget(Camera to, bool near)
        {
            cam = to;
            Depth = near ? NearDepth : FarDepth;
            transform.SetParent(to.transform, false);
            Measure();
        }

        /**
         * ПИКСЕЛЬ ВЕБА — точка iOS: геометрия руки написана в них. На телефоне — по плотности экрана, на
         * компьютере и в проверках — так, чтобы портретный кадр был шириной с айфон.
         */
        void Measure()
        {
            float w = cam.pixelWidth, h = cam.pixelHeight;
            if (Application.isMobilePlatform && Screen.dpi > 0) Dpr = Mathf.Max(1, Screen.dpi / 163f);
            else Dpr = h > w ? Mathf.Max(1, w / 390f) : 1;
            BarPx = (float)(HandGeom.BarHeightU * HandGeom.UnitOf(w / Dpr, h / Dpr)) * Dpr;
        }

        /** Метров мира на пиксель экрана на глубине руки. */
        float Metre => 2 * Depth * Mathf.Tan(cam.fieldOfView * Mathf.Deg2Rad / 2) / cam.pixelHeight;

        Vector3 Local(Vector2 px) => cam.transform.InverseTransformPoint(cam.ScreenToWorldPoint(new Vector3(px.x, px.y, Depth)));

        /** Геометрия руки веба для этого экрана — пиксели веба, y вниз. */
        public HandGeomOut Geom(Chair chair) => HandGeom.Mine(cam.pixelWidth / Dpr, cam.pixelHeight / Dpr, chair.Pose, chair.Hand.Count, Blend);

        public void Show(Chair chair, Board board, Func<Card, CardNode> get, Func<Face, Material> faceArt, Material backArt)
        {
            Chair = chair;
            Measure();
            var g = Geom(chair);
            int n = chair.Hand.Count;
            float w = (float)g.W * Dpr, h = (float)g.H * Dpr, H = cam.pixelHeight;
            Slots = new Rect[n];
            Angles = new float[n];
            for (int i = 0; i < n; i++)
            {
                var c = chair.Hand[i];
                var node = get(c);
                if (node.Id != board.Lifted) node.Move(transform);
                node.Paint(faceArt(c.Face), backArt);
                var s = g.Slots[i];
                float x = (float)s.X * Dpr, y = H - (float)s.Y * Dpr;
                Slots[i] = new Rect(x - w / 2, y - h / 2, w, h);
                Angles[i] = (float)s.Angle;
                // Карта стоит к глазу лицом: плашка «лежит» в XZ, −90° по X ставит её на ребро к камере; наклон
                // веера у веба — по часовой при y вниз, у Unity по Z против часовой — знак меняется.
                var at = Local(new Vector2(x, y)) + new Vector3(0, 0, -i * Depth * .0007f);
                node.Aim(at, 0, c.Up != true, w * Metre, Quaternion.Euler(0, 0, -(float)s.Angle) * Quaternion.Euler(-90, 0, 0));
            }
        }

        public float CardPx => Slots.Length > 0 ? Slots[0].width : 60 * Dpr;

        /** Какая карта руки под точкой экрана — верхняя из попавших, с учётом наклона; −1 — ни одной. */
        public int Under(Vector2 px)
        {
            for (int i = Slots.Length - 1; i >= 0; i--)
            {
                var r = Slots[i];
                var d = (Vector2)(Quaternion.Euler(0, 0, Angles[i]) * (px - r.center));
                if (Mathf.Abs(d.x) <= r.width / 2 && Mathf.Abs(d.y) <= r.height / 2) return i;
            }
            return -1;
        }

        /** Точка экрана над рукой (полоса худа и карты) — туда кладут в руку. */
        public bool Over(Vector2 px)
        {
            float top = BarPx;
            foreach (var r in Slots) top = Mathf.Max(top, r.yMax);
            return px.y < Mathf.Max(top, BarPx + CardPx * 1.4f) + 16 * Dpr;
        }

        /** Куда в руке ляжет карта, отпущенная над точкой `px`. */
        public int SlotAt(Vector2 px)
        {
            int i = 0;
            while (i < Slots.Length && Slots[i].center.x < px.x) i++;
            return i;
        }

        /**
         * ВЕРХНИЙ ПРАВЫЙ УГОЛ КРАЙНЕЙ КАРТЫ и её наклон — там сидит язычок ручки позы (`cornerOf` у веба).
         * `null` — карт нет.
         */
        public (Vector2 at, float angle)? Corner()
        {
            if (Slots.Length == 0) return null;
            int i = Slots.Length - 1;
            var r = Slots[i];
            var turn = Quaternion.Euler(0, 0, -Angles[i]);
            return (r.center + (Vector2)(turn * new Vector3(r.width / 2, r.height / 2)), Angles[i]);
        }
    }
}
