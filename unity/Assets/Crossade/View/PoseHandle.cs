// РУЧКА ПОЗЫ РУКИ — как у веба (`screen.ts`, `HANDLE`, `startPoseDrag`):
//
//   рука на виду     — ЯЗЫЧОК на верхнем правом углу крайней карты, с её наклоном; кружка нет;
//   рука спрятана    — кнопка в полосе худа, справа;
//   тап              — меню порядка руки: по масти, по номиналу, перемешать, перевернуть, наоборот;
//   тяга             — поза под пальцем: вбок — от стопки до широкой (140 пикселей веба), вверх-вниз — от
//                      спрятанной до ряда (120); отпустил — поза садится в ближайшую ступень (`HandGeom.Snap`).
//
// Размеры — пиксели веба: холст худа масштабирован плотностью экрана.

using System;
using System.Collections.Generic;
using Crossade.Table;
using Crossade.Wire;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Crossade.View
{
    public sealed class PoseHandle : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        const float GAP = 3, ARM = 20, THICK = 7, HIT = 52, TAP_PX = 10;
        static readonly (string how, string name)[] Dos = { ("suit", "По масти"), ("rank", "По номиналу"), ("shuffle", "Перемешать"), ("flip", "Перевернуть"), ("reverse", "Наоборот") };
        const float WIDE_PX = 140, LIFT_PX = 120;

        Hud hud;
        HandRig hand;
        Func<Store> store;
        Action redraw;
        RectTransform tab, button, menu;
        Vector2 downAt;
        PoseBlend b0;
        bool moved, dragging;

        public static PoseHandle Make(Hud hud, HandRig hand, Func<Store> store, Action redraw)
        {
            var go = new GameObject("pose handle", typeof(RectTransform), typeof(Image));
            go.transform.SetParent(hud.transform, false);
            var h = go.AddComponent<PoseHandle>();
            h.hud = hud;
            h.hand = hand;
            h.store = store;
            h.redraw = redraw;
            var r = (RectTransform)go.transform;
            r.anchorMin = r.anchorMax = Vector2.zero;
            r.pivot = new Vector2(.5f, .5f);
            r.sizeDelta = new Vector2(HIT, HIT);
            var hit = go.GetComponent<Image>();
            hit.color = new Color(0, 0, 0, 0);
            hit.raycastTarget = true;

            // Язычок: уголок из двух планок вокруг угла карты, снаружи на `GAP`.
            h.tab = new GameObject("tab", typeof(RectTransform)).GetComponent<RectTransform>();
            h.tab.SetParent(r, false);
            h.tab.sizeDelta = Vector2.zero;
            Bar(h.tab, new Vector2(-ARM + GAP, GAP), new Vector2(ARM + THICK, THICK));
            Bar(h.tab, new Vector2(GAP, -ARM + GAP), new Vector2(THICK, ARM));

            // Кнопка в полосе: плашка с тремя карточками веером — рука, которую можно вытянуть.
            h.button = Ui.Box(r, "in bar", Look.Black);
            h.button.sizeDelta = new Vector2(44, 44);
            var face = Ui.Fill(Ui.Box(h.button, "face", Look.PanelLight));
            face.offsetMin = new Vector2(3, 3);
            face.offsetMax = new Vector2(-3, -3);
            for (int i = -1; i <= 1; i++)
            {
                var card = Ui.Box(face, "card", Look.Paper);
                card.anchorMin = card.anchorMax = new Vector2(.5f, .5f);
                card.sizeDelta = new Vector2(10, 14);
                card.anchoredPosition = new Vector2(i * 6, -Mathf.Abs(i) * 1.5f);
                card.localRotation = Quaternion.Euler(0, 0, -i * 14);
            }
            return h;
        }

        static void Bar(RectTransform parent, Vector2 at, Vector2 size)
        {
            var edge = Ui.Box(parent, "edge", Look.Black, false);
            edge.pivot = new Vector2(0, 0);
            edge.anchoredPosition = at - new Vector2(1.5f, 1.5f);
            edge.sizeDelta = size + new Vector2(3, 3);
            var bar = Ui.Box(parent, "bar", Look.Gold, false);
            bar.pivot = new Vector2(0, 0);
            bar.anchoredPosition = at;
            bar.sizeDelta = size;
        }

        Chair Mine => store()?.MyChair;

        /** Поставить ручку по руке: язычок на углу или кнопка в полосе. Карт нет — ручки нет. */
        public void Place()
        {
            var chair = Mine;
            var r = (RectTransform)transform;
            if (chair == null || chair.Hand.Count == 0)
            {
                gameObject.SetActive(false);
                Close();
                return;
            }
            gameObject.SetActive(true);
            var dpr = hand.Dpr;
            var inBar = chair.Pose.Tuck && !dragging;
            tab.gameObject.SetActive(!inBar);
            button.gameObject.SetActive(inBar);
            if (inBar)
            {
                r.localRotation = Quaternion.identity;
                r.anchoredPosition = new Vector2(hudWidth - 36, hand.BarPx / dpr / 2);
                return;
            }
            if (hand.Corner() is not { } corner) return;
            r.anchoredPosition = corner.at / dpr;
            r.localRotation = Quaternion.Euler(0, 0, -corner.angle);
        }

        float hudWidth => hud.Root.rect.width;

        public void OnPointerDown(PointerEventData e)
        {
            var chair = Mine;
            if (chair == null) return;
            downAt = e.position;
            moved = false;
            b0 = HandGeom.BlendOf(chair.Pose);
        }

        public void OnDrag(PointerEventData e)
        {
            var d = (e.position - downAt) / hand.Dpr;
            if (!moved && d.magnitude < TAP_PX) return;
            if (!moved) Close();
            moved = dragging = true;
            // Экран Unity — y вверх: вверх по экрану — поднять руку.
            hand.Blend = new PoseBlend { Wide = Mathf.Clamp01((float)b0.Wide + d.x / WIDE_PX), Lift = Mathf.Clamp01((float)b0.Lift + d.y / LIFT_PX) };
            redraw();
        }

        public void OnPointerUp(PointerEventData e)
        {
            var chair = Mine;
            if (!moved)
            {
                if (menu != null) Close();
                else Open();
                return;
            }
            dragging = false;
            if (chair != null && hand.Blend is { } b)
            {
                var pose = HandGeom.Snap(b, chair.Pose);
                if (pose.Fan != chair.Pose.Fan || pose.Shrink != chair.Pose.Shrink || pose.Tuck != chair.Pose.Tuck)
                {
                    store().Act(Intents.Pose(chair.Id, pose.Fan, pose.Shrink, pose.Tuck));
                    // Ответ стола придёт следом; до него рука стоит в новой позе, а не прыгает назад.
                    chair.Pose = pose;
                }
            }
            hand.Blend = null;
            redraw();
        }

        void Open()
        {
            Close();
            menu = Ui.Box(hud.transform, "hand menu", Look.Black);
            var r = (RectTransform)transform;
            menu.anchorMin = menu.anchorMax = Vector2.zero;
            menu.pivot = new Vector2(1, 0);
            const float row = 34, pad = 8;
            menu.sizeDelta = new Vector2(150, Dos.Length * (row + 6) - 6 + 2 * pad);
            var at = r.anchoredPosition + new Vector2(10, 18);
            menu.anchoredPosition = new Vector2(Mathf.Min(at.x, hudWidth - 8), at.y);
            var inner = Ui.Fill(Ui.Box(menu, "panel", Look.Panel));
            inner.offsetMin = new Vector2(3, 3);
            inner.offsetMax = new Vector2(-3, -3);
            for (int i = 0; i < Dos.Length; i++)
            {
                var (how, name) = Dos[i];
                var b = Ui.Button(menu, name, () => Do(how), Look.PanelLight, Look.Ink, 13);
                var br = (RectTransform)b.transform;
                br.anchorMin = new Vector2(0, 1);
                br.anchorMax = new Vector2(1, 1);
                br.pivot = new Vector2(.5f, 1);
                br.offsetMin = new Vector2(pad, -pad - i * (row + 6) - row);
                br.offsetMax = new Vector2(-pad, -pad - i * (row + 6));
                b.GetComponentInChildren<Text>().alignment = TextAnchor.MiddleLeft;
            }
        }

        public void Close()
        {
            if (menu != null) Destroy(menu.gameObject);
            menu = null;
        }

        void Do(string how)
        {
            Close();
            var s = store();
            var chair = Mine;
            if (s == null || chair == null) return;
            if (how == "flip")
            {
                s.Act(Intents.Flip());
                return;
            }
            if (how != "shuffle")
            {
                s.Act(Intents.Arrange(how));
                return;
            }
            // Мешает клиент: порядок виден сразу, стол проверяет, что карты те же.
            var ids = new List<string>();
            foreach (var c in chair.Hand) ids.Add(c.Id);
            for (int i = ids.Count - 1; i > 0; i--)
            {
                var j = UnityEngine.Random.Range(0, i + 1);
                (ids[i], ids[j]) = (ids[j], ids[i]);
            }
            var o = Intents.Arrange("shuffle");
            o["ids"] = Wire.Tree.Box(ids);
            s.Act(o);
        }
    }
}
