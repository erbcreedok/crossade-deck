// ХУД — то, что поверх стола: название вверху, полоса внизу под рукой, всплывающая строка (почему стол
// не дал, что со связью). Холст висит на камере дальше руки: карты руки лежат поверх полосы.
//
// Размеры — в пикселях веба (точках iOS): холст масштабируется плотностью экрана (`HandRig.Dpr`), и
// числа здесь те же, что у мини-аппа.

using UnityEngine;
using UnityEngine.UI;

namespace Crossade.View
{
    public sealed class Hud : MonoBehaviour
    {
        /** Тап по названию стола. */
        public System.Action Home;
        public Canvas Canvas { get; private set; }
        public RectTransform Root => (RectTransform)transform;
        CanvasScaler scaler;
        Text title, toast;
        RectTransform bar, toastBox;
        float toastUntil;

        public static Hud Make(Camera cam)
        {
            var hud = new GameObject("Hud").AddComponent<Hud>();
            var canvas = hud.Canvas = hud.gameObject.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceCamera;
            canvas.worldCamera = cam;
            canvas.planeDistance = HandRig.Depth + 2;
            hud.scaler = hud.gameObject.AddComponent<CanvasScaler>();
            hud.scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize;
            hud.gameObject.AddComponent<GraphicRaycaster>();
            Ui.Events();

            hud.bar = Ui.Box(hud.transform, "bar", Look.Panel, false);
            hud.bar.anchorMin = new Vector2(0, 0);
            hud.bar.anchorMax = new Vector2(1, 0);
            hud.bar.pivot = new Vector2(.5f, 0);
            var edge = Ui.Box(hud.bar, "edge", Look.Black, false);
            edge.anchorMin = new Vector2(0, 1);
            edge.anchorMax = new Vector2(1, 1);
            edge.pivot = new Vector2(.5f, 1);
            edge.sizeDelta = new Vector2(0, 2);

            var pill = Ui.Box(hud.transform, "title", Look.Black);
            pill.anchorMin = pill.anchorMax = new Vector2(.5f, 1);
            pill.pivot = new Vector2(.5f, 1);
            pill.sizeDelta = new Vector2(240, 34);
            pill.anchoredPosition = new Vector2(0, -22);
            var face = Ui.Fill(Ui.Box(pill, "face", Look.Well));
            face.offsetMin = new Vector2(3, 3);
            face.offsetMax = new Vector2(-3, -3);
            hud.title = Ui.Words(face, "", 14, Look.Ink);
            hud.title.horizontalOverflow = HorizontalWrapMode.Overflow;
            // Тап по названию — назад к «Моим комнатам».
            var img = pill.GetComponent<Image>();
            img.raycastTarget = true;
            pill.gameObject.AddComponent<Button>().onClick.AddListener(() => hud.Home?.Invoke());

            hud.toastBox = Ui.Box(hud.transform, "toast", new Color(0, 0, 0, .78f));
            hud.toastBox.anchorMin = hud.toastBox.anchorMax = new Vector2(.5f, 0);
            hud.toastBox.pivot = new Vector2(.5f, 0);
            hud.toastBox.sizeDelta = new Vector2(320, 40);
            hud.toast = Ui.Words(hud.toastBox, "", 13, Look.Ink);
            hud.toastBox.gameObject.SetActive(false);
            return hud;
        }

        /** Плотность экрана и высота полосы (пиксели экрана) — от руки: полоса ровно под ней. */
        public void Fit(float dpr, float barPx)
        {
            scaler.scaleFactor = dpr;
            bar.sizeDelta = new Vector2(0, barPx / dpr);
            toastBox.anchoredPosition = new Vector2(0, barPx / dpr + 170);
        }

        public void Title(string text) => title.text = text ?? "";

        public void Say(string text, float seconds = 2.5f)
        {
            if (string.IsNullOrEmpty(text)) return;
            toast.text = text;
            toastBox.gameObject.SetActive(true);
            toastUntil = Time.realtimeSinceStartup + seconds;
        }

        void Update()
        {
            if (toastBox.gameObject.activeSelf && Time.realtimeSinceStartup > toastUntil) toastBox.gameObject.SetActive(false);
        }
    }
}
