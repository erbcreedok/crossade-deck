// ОКНО — плашка в облике стола (тёмный колодец, чёрная и деревянная кромка) и набор строк сверху вниз:
// заголовок, подпись раздела, ряд кнопок с переносом. Высота считается сама. Окна стула, крупье и раздачи
// собираются из него, как у веба — из тех же кирпичей.

using System;
using UnityEngine;
using UnityEngine.UI;

namespace Crossade.View
{
    public sealed class Panel
    {
        const float PAD = 12, GAP = 6, CHIP_H = 30;
        public readonly RectTransform Root, Body;
        readonly float width;
        float y = PAD, rowX = PAD, rowH;

        public Panel(Transform parent, string name, float width)
        {
            this.width = width;
            Root = Ui.Box(parent, name, Look.Black);
            Root.anchorMin = Root.anchorMax = new Vector2(.5f, 1);
            Root.pivot = new Vector2(.5f, 1);
            Root.GetComponent<Image>().raycastTarget = true;
            var wood = Ui.Fill(Ui.Box(Root, "wood", Look.Wood));
            wood.offsetMin = new Vector2(3, 3);
            wood.offsetMax = new Vector2(-3, -3);
            Body = Ui.Fill(Ui.Box(Root, "well", Look.Well));
            Body.offsetMin = new Vector2(5, 5);
            Body.offsetMax = new Vector2(-5, -5);
        }

        RectTransform At(RectTransform r, float x, float top, float w, float h)
        {
            r.anchorMin = r.anchorMax = new Vector2(0, 1);
            r.pivot = new Vector2(0, 1);
            r.anchoredPosition = new Vector2(x, -top);
            r.sizeDelta = new Vector2(w, h);
            return r;
        }

        void Break()
        {
            if (rowH > 0) y += rowH + GAP;
            rowX = PAD;
            rowH = 0;
        }

        /** Заголовок; справа — «Закрыть». */
        public Panel Head(string text, Action close, int size = 14)
        {
            Break();
            var t = Ui.Words(Body, text, size, Look.Ink, TextAnchor.MiddleLeft, 0);
            At((RectTransform)t.transform, PAD, y, width - 2 * PAD - 90, 30);
            if (close != null)
            {
                var b = Ui.Button(Body, "Закрыть", close, Look.Well, Look.InkDim, 11);
                At((RectTransform)b.transform, width - 10 - PAD - 80, y, 80, 30);
            }
            y += 30 + GAP;
            return this;
        }

        /** Подпись раздела — мелко, приглушённо. */
        public Panel Part(string text)
        {
            Break();
            var t = Ui.Words(Body, text, 10, Look.InkDim, TextAnchor.MiddleLeft, 0);
            At((RectTransform)t.transform, PAD, y, width - 2 * PAD, 16);
            y += 16 + 2;
            return this;
        }

        public Panel Note(string text, Color? color = null)
        {
            Break();
            var t = Ui.Words(Body, text, 11, color ?? Look.InkDim, TextAnchor.UpperLeft, 0);
            var h = 16 * Mathf.Ceil(text.Length * 7f / (width - 2 * PAD - 10));
            At((RectTransform)t.transform, PAD, y, width - 2 * PAD - 10, h);
            y += h + GAP;
            return this;
        }

        /**
         * Кнопка в строку с переносом. `on` — горит золотом (флаг стоит, выбрано); `may` — можно нажать, иначе
         * полупрозрачная. Ширина — по надписи.
         */
        public Button Chip(string text, Action click, bool on = false, bool may = true, int size = 11)
        {
            var w = Mathf.Max(44, text.Length * size * .62f + 22);
            if (rowX + w > width - 10 - PAD && rowX > PAD) Break();
            var b = Ui.Button(Body, text, () =>
            {
                if (may) click();
            }, on ? Look.Gold : Look.PanelLight, on ? Look.Black : Look.Ink, size);
            At((RectTransform)b.transform, rowX, y, w, CHIP_H);
            b.interactable = may;
            b.gameObject.AddComponent<CanvasGroup>().alpha = may ? 1 : .4f;
            rowX += w + GAP;
            rowH = CHIP_H;
            return b;
        }

        /** Большая кнопка на всю ширину. */
        public Button Wide(string text, Action click, bool may = true)
        {
            Break();
            var b = Ui.Button(Body, text, () =>
            {
                if (may) click();
            }, Look.Gold, Look.Black, 13);
            At((RectTransform)b.transform, PAD, y, width - 10 - 2 * PAD, 38);
            b.interactable = may;
            b.gameObject.AddComponent<CanvasGroup>().alpha = may ? 1 : .45f;
            y += 38 + GAP;
            return b;
        }

        /** Закончить: высота по содержимому, верх — `top` пикселей от верха экрана. */
        public RectTransform Done(float top)
        {
            Break();
            Root.sizeDelta = new Vector2(width, y + PAD - GAP + 10);
            Root.anchoredPosition = new Vector2(0, -top);
            return Root;
        }
    }
}
