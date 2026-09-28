// КИРПИЧИ ИНТЕРФЕЙСА — таблетки, кнопки и надписи в облике стола: скруглённые плашки цветов палитры,
// шрифт Tiny5. Холст, кнопка, строка — одной строкой кода, чтобы экраны читались как список того, что на них.

using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Crossade.View
{
    public static class Ui
    {
        static Sprite round;

        /** Скруглённая плашка, растягивается девятью частями. */
        public static Sprite Round
        {
            get
            {
                if (round != null) return round;
                const int n = 64, r = 20;
                var tex = new Texture2D(n, n, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                    {
                        float dx = Mathf.Max(0, Mathf.Max(r - x - .5f, x + .5f - (n - r))), dy = Mathf.Max(0, Mathf.Max(r - y - .5f, y + .5f - (n - r)));
                        float a = Mathf.Clamp01(r - Mathf.Sqrt(dx * dx + dy * dy) + .5f);
                        tex.SetPixel(x, y, new Color(1, 1, 1, a));
                    }
                tex.Apply();
                return round = Sprite.Create(tex, new Rect(0, 0, n, n), new Vector2(.5f, .5f), 100, 0, SpriteMeshType.FullRect, new Vector4(r, r, r, r));
            }
        }

        /**
         * Холст поверх всего, с системой событий для кнопок. На камере, а не «поверх экрана»: так он попадает
         * в кадр, который снимают проверки, — ближе руки и худа.
         */
        public static Canvas Overlay(string name, int order)
        {
            var go = new GameObject(name);
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceCamera;
            canvas.worldCamera = Camera.main;
            canvas.planeDistance = .5f;
            canvas.sortingOrder = order;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(780, 1688);
            scaler.matchWidthOrHeight = 0;
            go.AddComponent<GraphicRaycaster>();
            Events();
            return canvas;
        }

        public static void Events()
        {
            if (UnityEngine.Object.FindAnyObjectByType<EventSystem>() != null) return;
            var es = new GameObject("Events");
            es.AddComponent<EventSystem>();
            es.AddComponent<StandaloneInputModule>();
        }

        public static RectTransform Box(Transform parent, string name, Color color, bool rounded = true)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>();
            img.color = color;
            if (rounded)
            {
                img.sprite = Round;
                img.type = Image.Type.Sliced;
            }
            img.raycastTarget = false;
            return (RectTransform)go.transform;
        }

        public static Text Words(Transform parent, string text, int size, Color color, TextAnchor align = TextAnchor.MiddleCenter, float pad = 20)
        {
            var go = new GameObject("text", typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);
            var r = (RectTransform)go.transform;
            r.anchorMin = Vector2.zero;
            r.anchorMax = Vector2.one;
            r.offsetMin = new Vector2(pad, 0);
            r.offsetMax = new Vector2(-pad, 0);
            var t = go.GetComponent<Text>();
            t.font = Look.Font;
            t.fontSize = size;
            t.color = color;
            t.alignment = align;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            t.text = text;
            return t;
        }

        /** Кнопка-таблетка: фон, рамка, надпись. */
        public static Button Button(Transform parent, string text, Action click, Color? fill = null, Color? ink = null, int size = 34)
        {
            var frame = Box(parent, "button " + text, Look.Black);
            var face = Box(frame, "face", fill ?? Look.Panel);
            face.anchorMin = Vector2.zero;
            face.anchorMax = Vector2.one;
            face.offsetMin = new Vector2(5, 5);
            face.offsetMax = new Vector2(-5, -5);
            // Надпись кнопки — в строку: короткую кнопку не переносит по буквам.
            var words = Words(face, text, size, ink ?? Look.Ink, TextAnchor.MiddleCenter, Mathf.Min(12, size * .6f));
            words.horizontalOverflow = HorizontalWrapMode.Overflow;
            var img = frame.GetComponent<Image>();
            img.raycastTarget = true;
            var b = frame.gameObject.AddComponent<Button>();
            b.targetGraphic = img;
            b.onClick.AddListener(() => click());
            return b;
        }

        /** Поставить по вертикали сверху вниз: отступ сверху, высота, поля по бокам. */
        public static RectTransform Row(RectTransform r, float top, float height, float side = 48)
        {
            r.anchorMin = new Vector2(0, 1);
            r.anchorMax = new Vector2(1, 1);
            r.pivot = new Vector2(.5f, 1);
            r.offsetMin = new Vector2(side, -top - height);
            r.offsetMax = new Vector2(-side, -top);
            return r;
        }

        public static RectTransform Fill(RectTransform r)
        {
            r.anchorMin = Vector2.zero;
            r.anchorMax = Vector2.one;
            r.offsetMin = r.offsetMax = Vector2.zero;
            return r;
        }

        /** Над кнопкой ли палец: тогда стол жест не получает. */
        public static bool Busy(int finger)
        {
            var es = EventSystem.current;
            if (es == null) return false;
            return finger < 0 ? es.IsPointerOverGameObject() : es.IsPointerOverGameObject(finger);
        }
    }
}
