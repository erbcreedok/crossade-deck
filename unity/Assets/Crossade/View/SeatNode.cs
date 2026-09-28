// СТУЛ — фишка на месте за столом: круг цвета человека с буквой имени и табличка с именем. Это место,
// где потом встанет аватар: сейчас фишка, дальше — модель.

using Crossade.Table;
using Crossade.Wire;
using UnityEngine;

namespace Crossade.View
{
    public sealed class SeatNode : MonoBehaviour
    {
        public string Id;
        Transform puck, ring;
        TextMesh letter, name;
        MeshRenderer puckPaint, ringPaint;
        Transform turnMark;

        public static SeatNode Make(Transform table, string id)
        {
            var seat = new GameObject("seat " + id).AddComponent<SeatNode>();
            seat.Id = id;
            seat.transform.SetParent(table, false);
            seat.ring = Disc(seat.transform, "ring", 1.25f, .1f, out seat.ringPaint);
            seat.puck = Disc(seat.transform, "puck", 1.05f, .16f, out seat.puckPaint);
            seat.letter = Look.Label(seat.transform, "", Look.Ink, .5f);
            seat.letter.transform.localPosition = new Vector3(0, .3f, 0);
            seat.name = Look.Label(seat.transform, "", Look.Ink, .3f);
            seat.name.transform.localPosition = new Vector3(0, .05f, -.95f);
            seat.turnMark = Disc(seat.transform, "turn", .3f, .05f, out var mark);
            mark.sharedMaterial = Look.Solid(Look.Gold, true);
            seat.turnMark.localPosition = new Vector3(0, .02f, .95f);
            seat.gameObject.AddComponent<SphereCollider>().radius = .65f;
            return seat;
        }

        static Transform Disc(Transform parent, string name, float size, float height, out MeshRenderer paint)
        {
            var node = new GameObject(name).transform;
            node.SetParent(parent, false);
            node.localScale = new Vector3(size, height / 2, size);
            node.localPosition = new Vector3(0, height / 2, 0);
            node.gameObject.AddComponent<MeshFilter>().sharedMesh = Look.Cylinder;
            paint = node.gameObject.AddComponent<MeshRenderer>();
            return node;
        }

        public void Show(Chair chair, Person who, bool mine, bool hasTurn)
        {
            var r = chair.Croupier ? Ring.CroupierRadius : Ring.SeatRadius;
            var (x, y) = Ring.SeatPoint(chair.Angle, r + .35);
            transform.localPosition = Board.At(x, y);
            transform.localRotation = Quaternion.Euler(0, -(float)chair.Angle, 0);
            var ink = who != null ? Look.Hex(who.Ink ?? "#cdb98f") : Look.InkDim;
            ringPaint.sharedMaterial = Look.Solid(mine ? Look.Gold : who != null ? ink : Look.PanelLight, true);
            puckPaint.sharedMaterial = Look.Solid(who != null ? Look.Panel : Look.Well, true);
            var label = chair.Croupier ? who?.Name ?? "крупье" : who?.Name ?? "свободно";
            letter.text = who?.Name is { Length: > 0 } n ? n.Substring(0, 1).ToUpperInvariant() : "";
            letter.color = mine ? Look.Gold : Look.Ink;
            name.text = label;
            name.color = mine ? Look.Gold : who != null ? Look.Ink : Look.InkDim;
            turnMark.gameObject.SetActive(hasTurn);
        }

        void LateUpdate()
        {
            // Надписи смотрят в камеру: читаются с любого стула и при любом наклоне.
            var cam = Camera.main;
            if (cam == null) return;
            foreach (var t in new[] { letter.transform, name.transform })
                t.rotation = Quaternion.LookRotation(t.position - cam.transform.position, cam.transform.up);
        }
    }

    /** Очерченное место на сукне — круг хода. */
    public sealed class PileMark : MonoBehaviour
    {
        public static PileMark Ring(Transform table, Pile pile, double x, double y)
        {
            var mark = new GameObject("mark " + pile.Id).AddComponent<PileMark>();
            mark.transform.SetParent(table, false);
            mark.transform.localPosition = Board.At(x, y, .002f);
            var line = mark.gameObject.AddComponent<LineRenderer>();
            line.useWorldSpace = false;
            line.loop = true;
            line.widthMultiplier = .06f;
            line.sharedMaterial = Look.Solid(new Color(1, 1, 1, .18f));
            line.startColor = line.endColor = new Color(.96f, .92f, .82f, .35f);
            const int n = 72;
            var r = (float)(Table.Ring.Spread + Table.Ring.CardH / 2);
            line.positionCount = n;
            for (int i = 0; i < n; i++)
            {
                var a = i * Mathf.PI * 2 / n;
                line.SetPosition(i, new Vector3(Mathf.Sin(a) * r, 0, Mathf.Cos(a) * r));
            }
            if (!string.IsNullOrEmpty(pile.Name))
            {
                var label = Look.Label(mark.transform, pile.Name, Look.InkDim, .3f);
                label.transform.localPosition = new Vector3(0, .01f, -r - .4f);
                label.transform.localRotation = Quaternion.Euler(90, 0, 0);
            }
            return mark;
        }
    }
}
