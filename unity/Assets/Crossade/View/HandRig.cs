// МОЯ РУКА — карты у нижнего края экрана, в позе, которую видят все (`HandPose`):
//   fan     веером, иначе — прямо;
//   shrink  сжаты: видна одна верхняя карта;
//   tuck    убраны за низ экрана, торчит краешек.
// Рука висит на камере: куда ни поверни стол, она на месте, как худ у веба.

using System;
using Crossade.Wire;
using UnityEngine;

namespace Crossade.View
{
    public sealed class HandRig : MonoBehaviour
    {
        /** Как далеко от глаза висят карты руки: ближе стола, дальше худа. */
        public const float Depth = 3f;
        /** Ширина карты руки — доля ширины экрана. */
        const float CARD_OF_WIDTH = .2f;
        /** Над нижним краем: здесь лежит полоса худа. */
        public float BarPx = 150;

        Camera cam;
        public Chair Chair { get; private set; }
        /** Где лежит i-я карта на экране — для жестов. */
        public Rect[] Slots = Array.Empty<Rect>();

        public static HandRig Make(Camera cam)
        {
            var rig = new GameObject("Hand").AddComponent<HandRig>();
            rig.cam = cam;
            rig.transform.SetParent(cam.transform, false);
            return rig;
        }

        /** Метров мира на пиксель экрана на глубине руки. */
        float Metre => 2 * Depth * Mathf.Tan(cam.fieldOfView * Mathf.Deg2Rad / 2) / cam.pixelHeight;

        Vector3 Local(Vector2 px) => cam.transform.InverseTransformPoint(cam.ScreenToWorldPoint(new Vector3(px.x, px.y, Depth)));

        public float CardPx => cam.pixelWidth * CARD_OF_WIDTH;

        public void Show(Chair chair, Board board, Func<Card, CardNode> get, Func<Face, Material> faceArt, Material backArt)
        {
            Chair = chair;
            int n = chair.Hand.Count;
            float w = CardPx, h = w * 1.4f, W = cam.pixelWidth;
            var pose = chair.Pose;
            float step = n <= 1 ? 0 : Mathf.Min(w * .62f, (W - 24 - w) / (n - 1));
            if (pose.Shrink) step = 0;
            float spread = pose.Fan && !pose.Shrink ? Mathf.Min(40f, n * 5f) : 0;
            float baseY = BarPx + h * .5f + 8;
            if (pose.Tuck) baseY = BarPx - h * .3f;
            Slots = new Rect[n];
            for (int i = 0; i < n; i++)
            {
                var c = chair.Hand[i];
                var node = get(c);
                if (node.Id != board.Lifted) node.Move(transform);
                node.Paint(faceArt(c.Face), backArt);
                float t = n <= 1 ? 0 : (float)i / (n - 1) - .5f;
                float x = W / 2 + (i - (n - 1) / 2f) * step;
                float y = baseY - (pose.Fan ? Mathf.Abs(t) * Mathf.Abs(t) * spread * 2.2f : 0);
                var tiltDeg = -t * spread;
                Slots[i] = new Rect(x - w / 2, y - h / 2, w, h);
                // Карта стоит к глазу лицом: плашка «лежит» в XZ, поворот на −90° по X ставит её на ребро к камере.
                var at = Local(new Vector2(x, y)) + new Vector3(0, 0, -i * .002f);
                var face = Quaternion.Euler(-90, 0, 0);
                node.Aim(at, 0, c.Up != true, w * Metre, Quaternion.Euler(0, 0, tiltDeg) * face);
            }
        }

        /** Какая карта руки под точкой экрана — верхняя из попавших; −1 — ни одной. */
        public int Under(Vector2 px)
        {
            for (int i = Slots.Length - 1; i >= 0; i--)
                if (Slots[i].Contains(px)) return i;
            return -1;
        }

        /** Точка экрана над рукой (по высоте полосы и карт) — туда кладут в руку. */
        public bool Over(Vector2 px) => px.y < BarPx + CardPx * 1.4f + 16;

        /** Куда в руке ляжет карта, отпущенная над точкой `px`. */
        public int SlotAt(Vector2 px)
        {
            int i = 0;
            while (i < Slots.Length && Slots[i].center.x < px.x) i++;
            return i;
        }
    }
}
