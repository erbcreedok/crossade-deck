// ХУД — то, что поверх стола: название вверху, полоса внизу под рукой, всплывающая строка (почему стол
// не дал, что со связью). Холст висит на камере дальше руки: карты руки лежат поверх полосы.

using UnityEngine;
using UnityEngine.UI;

namespace Crossade.View
{
    public sealed class Hud : MonoBehaviour
    {
        Text title, toast;
        Image toastBack, bar;
        float toastUntil;

        public static Hud Make(Camera cam, float barPx)
        {
            var hud = new GameObject("Hud").AddComponent<Hud>();
            var canvas = hud.gameObject.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceCamera;
            canvas.worldCamera = cam;
            canvas.planeDistance = HandRig.Depth + 2;
            var scaler = hud.gameObject.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize;
            hud.gameObject.AddComponent<GraphicRaycaster>();

            hud.bar = Box(hud.transform, "bar", Look.Panel);
            Pin(hud.bar.rectTransform, new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, barPx), new Vector2(.5f, 0));

            var pill = Box(hud.transform, "title", Look.Well);
            Pin(pill.rectTransform, new Vector2(.2f, 1), new Vector2(.8f, 1), new Vector2(0, 64), new Vector2(.5f, 1), -56);
            hud.title = Words(pill.transform, "", 30, Look.Ink);

            hud.toastBack = Box(hud.transform, "toast", new Color(0, 0, 0, .72f));
            Pin(hud.toastBack.rectTransform, new Vector2(.08f, 0), new Vector2(.92f, 0), new Vector2(0, 72), new Vector2(.5f, 0), barPx + 360);
            hud.toast = Words(hud.toastBack.transform, "", 28, Look.Ink);
            hud.toastBack.gameObject.SetActive(false);
            return hud;
        }

        static Image Box(Transform parent, string name, Color color)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>();
            img.color = color;
            img.raycastTarget = false;
            return img;
        }

        static void Pin(RectTransform r, Vector2 min, Vector2 max, Vector2 size, Vector2 pivot, float y = 0)
        {
            r.anchorMin = min;
            r.anchorMax = max;
            r.pivot = pivot;
            r.sizeDelta = size;
            r.anchoredPosition = new Vector2(0, y);
        }

        static Text Words(Transform parent, string text, int size, Color color)
        {
            var go = new GameObject("text", typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);
            var r = (RectTransform)go.transform;
            r.anchorMin = Vector2.zero;
            r.anchorMax = Vector2.one;
            r.sizeDelta = new Vector2(-24, 0);
            var t = go.GetComponent<Text>();
            t.font = Look.Font;
            t.fontSize = size;
            t.color = color;
            t.alignment = TextAnchor.MiddleCenter;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Truncate;
            t.raycastTarget = false;
            t.text = text;
            return t;
        }

        public void Title(string text) => title.text = text ?? "";

        public void Say(string text, float seconds = 2.5f)
        {
            if (string.IsNullOrEmpty(text)) return;
            toast.text = text;
            toastBack.gameObject.SetActive(true);
            toastUntil = Time.realtimeSinceStartup + seconds;
        }

        void Update()
        {
            if (toastBack.gameObject.activeSelf && Time.realtimeSinceStartup > toastUntil) toastBack.gameObject.SetActive(false);
        }
    }
}
