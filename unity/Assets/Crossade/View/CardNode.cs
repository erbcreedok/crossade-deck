// КАРТА НА ЭКРАНЕ — тонкая пластинка: лицо сверху, рубашка снизу. Стол говорит, ГДЕ ей быть
// (`Aim`), а она сама туда едет: так любой перенос — с колоды в руку, из руки на сукно, у соседа —
// выглядит полётом, и отдельной анимации для каждого случая нет.
//
// Оси карты: лежит в плоскости XZ, верх карты — к +Z, лицо смотрит в +Y. `flip` — поворот вокруг
// длинной оси: 0 — лицом вверх, 180 — рубашкой.

using UnityEngine;

namespace Crossade.View
{
    public sealed class CardNode : MonoBehaviour
    {
        public const float Thick = .012f;
        public string Id;

        Transform body, flipper;
        MeshRenderer top, bottom;
        Vector3 aimAt;
        Quaternion aimTurn = Quaternion.identity;
        float aimFlip, flip, aimScale = 1;
        bool placed;
        /** Держит палец: стол её не двигает, двигает жест. */
        public bool Held;

        public static CardNode Make(Transform parent, string id)
        {
            var node = new GameObject("card " + id).AddComponent<CardNode>();
            node.Id = id;
            node.transform.SetParent(parent, false);
            node.flipper = new GameObject("flip").transform;
            node.flipper.SetParent(node.transform, false);
            node.body = new GameObject("body").transform;
            node.body.SetParent(node.flipper, false);
            node.body.localScale = new Vector3(.96f, Thick, 1.36f);
            node.body.gameObject.AddComponent<MeshFilter>().sharedMesh = Look.Cube;
            node.body.gameObject.AddComponent<MeshRenderer>().sharedMaterial = Look.Solid(Look.Paper);
            node.top = Side(node.flipper, "face", Thick / 2 + .0005f, 90);
            node.bottom = Side(node.flipper, "back", -Thick / 2 - .0005f, -90);
            node.gameObject.AddComponent<BoxCollider>().size = new Vector3(1, Thick * 2, 1.4f);
            return node;
        }

        static MeshRenderer Side(Transform parent, string name, float y, float tilt)
        {
            var q = new GameObject(name).transform;
            q.SetParent(parent, false);
            q.localPosition = new Vector3(0, y, 0);
            // Квад смотрит в −Z; наклон на ±90° по X кладёт его лицом вверх или вниз, верхом к +Z.
            q.localRotation = Quaternion.Euler(tilt, 0, 0) * (tilt < 0 ? Quaternion.Euler(0, 0, 180) : Quaternion.identity);
            q.localScale = new Vector3(1, 1.4f, 1);
            q.gameObject.AddComponent<MeshFilter>().sharedMesh = Look.Quad;
            return q.gameObject.AddComponent<MeshRenderer>();
        }

        /** Что нарисовано: лицо (`null` — лица не видно, обе стороны рубашкой) и рубашка. */
        public void Paint(Material face, Material back)
        {
            top.sharedMaterial = face ?? back;
            bottom.sharedMaterial = back;
        }

        /** Куда ехать — в координатах родителя. `faceUp` — лицом вверх (к +Y родителя). */
        public void Aim(Vector3 at, float yaw, bool faceUp, float scale = 1, Quaternion? tilt = null)
        {
            aimAt = at;
            aimTurn = (tilt ?? Quaternion.identity) * Quaternion.Euler(0, yaw, 0);
            aimFlip = faceUp ? 0 : 180;
            aimScale = scale;
            if (placed) return;
            placed = true;
            Snap();
        }

        public void Snap()
        {
            transform.localPosition = aimAt;
            transform.localRotation = aimTurn;
            transform.localScale = Vector3.one * aimScale;
            flip = aimFlip;
            flipper.localRotation = Quaternion.Euler(0, 0, flip);
        }

        /** Сменить родителя, не прыгнув: карта едет к новому месту из того, где её видно сейчас. */
        public void Move(Transform parent)
        {
            if (transform.parent == parent) return;
            transform.SetParent(parent, true);
        }

        void Update()
        {
            if (Held) return;
            var k = 1 - Mathf.Exp(-Time.deltaTime * 14);
            var p = transform.localPosition;
            var far = Vector3.Distance(p, aimAt);
            // В полёте карта приподнимается: иначе через соседние она проезжает насквозь.
            var arc = Mathf.Min(far, 3f) * .08f;
            transform.localPosition = Vector3.Lerp(p, aimAt + Vector3.up * arc, k);
            transform.localRotation = Quaternion.Slerp(transform.localRotation, aimTurn, k);
            transform.localScale = Vector3.Lerp(transform.localScale, Vector3.one * aimScale, k);
            flip = Mathf.Lerp(flip, aimFlip, k);
            flipper.localRotation = Quaternion.Euler(0, 0, flip);
            if (far < .001f) transform.localPosition = aimAt;
        }

        /** Палец несёт карту: сразу туда, без сглаживания. */
        public void Carry(Vector3 world, Quaternion turn)
        {
            transform.position = world;
            transform.rotation = turn;
        }
    }
}
