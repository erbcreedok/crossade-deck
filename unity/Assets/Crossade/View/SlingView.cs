// РОГАТКА НА ЭКРАНЕ (`slingHtml` у веба): от карты к центру камеры растёт полупрозрачная стрелка —
// на столько, насколько заряжена; зарядилась — дотянулась, и в точке попадания контур карты: золотой, если
// карта долетит до сукна, красный — если мимо.

using System;
using Crossade.Play;
using UnityEngine;
using UnityEngine.UI;

namespace Crossade.View
{
    public sealed class SlingView : MonoBehaviour
    {
        Func<Finger> finger;
        HandRig hand;
        RectTransform arrow, ring;
        Image arrowPaint;
        Image[] ringPaint;

        public static SlingView Make(Hud hud, HandRig hand, Func<Finger> finger)
        {
            var v = new GameObject("sling", typeof(RectTransform)).AddComponent<SlingView>();
            v.transform.SetParent(hud.transform, false);
            Ui.Fill((RectTransform)v.transform);
            v.finger = finger;
            v.hand = hand;
            v.arrow = Ui.Box(v.transform, "arrow", Look.Gold, false);
            v.arrow.anchorMin = v.arrow.anchorMax = Vector2.zero;
            v.arrow.pivot = new Vector2(0, .5f);
            v.arrowPaint = v.arrow.GetComponent<Image>();
            v.ring = new GameObject("contour", typeof(RectTransform)).GetComponent<RectTransform>();
            v.ring.SetParent(v.transform, false);
            v.ring.anchorMin = v.ring.anchorMax = Vector2.zero;
            // Контур карты — четыре планки.
            v.ringPaint = new Image[4];
            for (int i = 0; i < 4; i++)
            {
                var edge = Ui.Box(v.ring, "edge", Look.Gold, false);
                v.ringPaint[i] = edge.GetComponent<Image>();
            }
            v.arrow.gameObject.SetActive(false);
            v.ring.gameObject.SetActive(false);
            return v;
        }

        void LateUpdate()
        {
            var aim = finger()?.Sling;
            arrow.gameObject.SetActive(aim != null);
            ring.gameObject.SetActive(aim != null && aim.Armed);
            if (aim == null) return;
            var dpr = hand.Dpr;
            Vector2 a = aim.From / dpr, b = aim.Target / dpr;
            var full = b - a;
            var reach = full * (float)Math.Min(1, aim.Charge);
            arrow.anchoredPosition = a;
            arrow.sizeDelta = new Vector2(reach.magnitude, 5);
            arrow.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(full.y, full.x) * Mathf.Rad2Deg);
            arrowPaint.color = new Color(Look.Gold.r, Look.Gold.g, Look.Gold.b, aim.Armed ? .9f : .35f + .35f * (float)aim.Charge);
            if (!aim.Armed) return;
            var ink = aim.Valid ? Look.Gold : Look.Danger;
            float w = hand.CardPx / dpr * .6f, h = w * 1.4f, t = 3;
            ring.anchoredPosition = b;
            Edge(0, new Vector2(-w / 2, h / 2 - t), new Vector2(w, t), ink);
            Edge(1, new Vector2(-w / 2, -h / 2), new Vector2(w, t), ink);
            Edge(2, new Vector2(-w / 2, -h / 2), new Vector2(t, h), ink);
            Edge(3, new Vector2(w / 2 - t, -h / 2), new Vector2(t, h), ink);
        }

        void Edge(int i, Vector2 at, Vector2 size, Color ink)
        {
            var r = ringPaint[i].rectTransform;
            r.anchorMin = r.anchorMax = new Vector2(.5f, .5f);
            r.pivot = Vector2.zero;
            r.anchoredPosition = at;
            r.sizeDelta = size;
            ringPaint[i].color = ink;
        }
    }
}
