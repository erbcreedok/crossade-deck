// СТОЛ В ВЕЩАХ UNITY — снимок стола (`Snapshot`) глазами одного человека.
//
// Оси — те же, что у сервера (`ring.ts`): единица — ширина карты, середина стола — ноль, +y — к своей
// стороне. В Unity: x → x, y → −z, сукно — плоскость XZ на высоте 0, одна единица — один метр мира
// (для AR весь стол потом сжимается одним масштабом). Стол повёрнут так, что мой стул внизу экрана.
//
// Карты не пересоздаются: у каждой свой узел по id, и новый снимок только говорит ему, куда ехать.

using System.Collections.Generic;
using Crossade.Table;
using Crossade.Wire;
using UnityEngine;

namespace Crossade.View
{
    public sealed class Board : MonoBehaviour
    {
        /** Сдвиг карты в стопке — к правому верхнему углу экрана, как у веба. */
        const float PILE_SHIFT = .004f;
        /** Карта чужой руки на столе — меньше настоящей. */
        const float SEAT_HAND_SCALE = .55f;

        public Transform Table { get; private set; }
        public HandRig Hand;
        public float MyAngle { get; private set; }

        readonly Dictionary<string, CardNode> cards = new();
        readonly Dictionary<string, SeatNode> seats = new();
        readonly List<PileMark> marks = new();
        Transform felt, ground;

        /** Обои под столом — только в обычном виде; в AR под столом комната. */
        public void Room(bool on) => ground.gameObject.SetActive(on);

        public static Board Make()
        {
            var board = new GameObject("Board").AddComponent<Board>();
            board.Build();
            return board;
        }

        void Build()
        {
            ground = Solid("Ground", transform, Look.Quad, Look.FeltDark, false);
            ground.localRotation = Quaternion.Euler(90, 0, 0);
            ground.localScale = new Vector3(80, 80, 1);
            ground.localPosition = new Vector3(0, -.62f, 0);

            Table = new GameObject("Table").transform;
            Table.SetParent(transform, false);
            float r = (float)Ring.TableRadius;
            // Сукно — ровный круг на нуле, борт — тор по кромке, чуть выше сукна: карта у края под него не заезжает.
            felt = Solid("Felt", Table, Shapes.Disc(), Look.Felt, false);
            felt.localScale = new Vector3(r, 1, r);
            var rim = Solid("Rim", Table, Shapes.Torus(r + .28f, .34f), Look.Wood, true);
            rim.localPosition = new Vector3(0, .02f, 0);
            var apron = Solid("Apron", Table, Shapes.Disc(), Look.Panel, false);
            apron.localScale = new Vector3(r + .6f, 1, r + .6f);
            apron.localPosition = new Vector3(0, -.35f, 0);

            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 1.1f;
            sun.transform.SetParent(transform, false);
            sun.transform.rotation = Quaternion.Euler(55, -30, 0);
            RenderSettings.ambientLight = new Color(.55f, .55f, .5f);
        }

        static Transform Solid(string name, Transform parent, Mesh mesh, Color color, bool lit)
        {
            var node = new GameObject(name).transform;
            node.SetParent(parent, false);
            node.gameObject.AddComponent<MeshFilter>().sharedMesh = mesh;
            node.gameObject.AddComponent<MeshRenderer>().sharedMaterial = Look.Solid(color, lit);
            return node;
        }

        /** Точка стола → мир (до поворота стола — локально в `Table`). */
        public static Vector3 At(double x, double y, float h = 0) => new((float)x, h, -(float)y);

        /** Точка сукна под лучом → координаты стола; `null` — луч мимо плоскости. */
        public Vector2? ToDesk(Ray ray)
        {
            var plane = new Plane(Table.up, Table.position);
            if (!plane.Raycast(ray, out var d)) return null;
            var local = Table.InverseTransformPoint(ray.GetPoint(d));
            return new Vector2(local.x, -local.z);
        }

        public CardNode Node(string id) => cards.TryGetValue(id, out var n) ? n : null;

        /** Id карты, которую держит мой палец: её место решает жест, а не снимок. */
        public string Lifted;
        /** Стопку тянут за индикатор: она стоит под пальцем, а не там, где её помнит стол. */
        public (string pile, double x, double y)? Moving;

        public (double x, double y) PileAt(Pile pile) => Moving is { } m && m.pile == pile.Id ? (m.x, m.y) : (pile.X, pile.Y);

        public void Show(Store store)
        {
            var s = store.S;
            var me = store.Me?.Key;
            string faces = s.Rules.Faces ?? "classic", back = s.Rules.Back ?? "plaid";
            var backArt = Look.Art(Look.BackPath(back));
            Material FaceArt(Face f) => f == null ? null : Look.Art(Look.FacePath(faces, f));

            var mine = s.Chairs.Find(c => c.Owner == me);
            MyAngle = (float)(mine?.Angle ?? 0);
            Table.localRotation = Quaternion.Euler(0, MyAngle, 0);

            var seen = new HashSet<string>();
            CardNode Get(Card c)
            {
                seen.Add(c.Id);
                if (!cards.TryGetValue(c.Id, out var n)) cards[c.Id] = n = CardNode.Make(Table, c.Id);
                return n;
            }

            // Стопки: карта на карте. Колода стоит поверх сукна, а карты «под колодой» — под ней.
            int pileLayer = s.Felt.Count + 2;
            foreach (var mark in marks) Destroy(mark.gameObject);
            marks.Clear();
            foreach (var pile in s.Piles)
            {
                var (px, py) = PileAt(pile);
                if (pile.Ring)
                {
                    // Контур круга — только пока несут то, что можно в него положить (так решил владелец).
                    if (Lifted != null || store.Carries.Count > 0) marks.Add(PileMark.Ring(Table, pile, px, py));
                    int k = 0;
                    foreach (var c in pile.Cards)
                    {
                        var turn = c.Turn ?? 0;
                        var (x, y) = Ring.Spot(px, py, turn, Ring.Lay);
                        var n = Get(c);
                        Park(n, Table);
                        n.Paint(FaceArt(c.Face), backArt);
                        n.Aim(At(x, y, CardNode.Thick * (pileLayer + k++)), (float)Ring.Face(turn), c.Up == true);
                    }
                    continue;
                }
                for (int i = 0; i < pile.Cards.Count; i++)
                {
                    var c = pile.Cards[i];
                    var n = Get(c);
                    Park(n, Table);
                    n.Paint(FaceArt(c.Face), backArt);
                    var shift = i * PILE_SHIFT;
                    n.Aim(At(px + shift, py - shift, CardNode.Thick * (pileLayer + i)), (float)pile.Angle, c.Up == true);
                }
                pileLayer += pile.Cards.Count + 1;
            }

            for (int i = 0; i < s.Felt.Count; i++)
            {
                var c = s.Felt[i];
                var n = Get(c);
                Park(n, Table);
                n.Paint(FaceArt(c.Face), backArt);
                n.Aim(At(c.X, c.Y, CardNode.Thick * (c.Under ? 0 : i + 1)), (float)c.Angle, c.Up == true);
            }

            var alive = new HashSet<string>();
            foreach (var chair in s.Chairs)
            {
                alive.Add(chair.Id);
                if (!seats.TryGetValue(chair.Id, out var seat)) seats[chair.Id] = seat = SeatNode.Make(Table, chair.Id);
                var owner = chair.Owner == null ? null : s.People.Find(p => p.Key == chair.Owner);
                seat.Show(chair, owner, chair.Owner != null && chair.Owner == me, s.Play?.Turn != null && s.Play.Turn == chair.Owner);

                if (chair.Owner != null && chair.Owner == me && Hand != null)
                {
                    Hand.Lay = s.Play?.Lay;
                    Hand.Show(chair, this, Get, FaceArt, backArt);
                    continue;
                }
                // Чужая рука на столе — веером у стула, лицом к середине.
                var t = (float)chair.Angle * Mathf.Deg2Rad;
                var r = (float)Ring.SeatRadius - 1.15f;
                int count = chair.Hand.Count;
                for (int i = 0; i < count; i++)
                {
                    var c = chair.Hand[i];
                    var n = Get(c);
                    Park(n, Table);
                    n.Paint(FaceArt(c.Face), backArt);
                    var off = (i - (count - 1) / 2f) * .42f * SEAT_HAND_SCALE;
                    var along = new Vector2(Mathf.Cos(t), -Mathf.Sin(t));
                    var x = Mathf.Sin(t) * r + along.x * off;
                    var y = Mathf.Cos(t) * r + along.y * off;
                    n.Aim(At(x, y, CardNode.Thick * (i + 1) * SEAT_HAND_SCALE), -(float)chair.Angle, c.Up == true, SEAT_HAND_SCALE);
                }
            }
            foreach (var id in new List<string>(seats.Keys))
                if (!alive.Contains(id))
                {
                    Destroy(seats[id].gameObject);
                    seats.Remove(id);
                }

            // Чужие пальцы в воздухе: карту несут — она висит над тем местом, куда её тянут.
            foreach (var carry in store.Carries.Values)
            {
                if (!cards.TryGetValue(carry.Card.Id, out var n) || carry.Card.Id == Lifted) continue;
                if (OverAt(s, carry.Over) is not { } over) continue;
                Park(n, Table);
                n.Paint(FaceArt(carry.Card.Face), backArt);
                n.Aim(At(over.x, over.y, .35f), -MyAngle, carry.Card.Up == true || (carry.From?.In == "felt" && carry.From.Up));
            }

            foreach (var id in new List<string>(cards.Keys))
                if (!seen.Contains(id))
                {
                    Destroy(cards[id].gameObject);
                    cards.Remove(id);
                }
        }

        /** Точка стола над местом `Where`: сукно — сама точка, стопка — её место, рука — стул. */
        static (double x, double y)? OverAt(Snapshot s, Where w)
        {
            if (w == null) return null;
            switch (w.In)
            {
                case "felt": return (w.X, w.Y);
                case "deck":
                    var pile = s.Piles.Find(p => p.Id == w.Pile);
                    if (pile == null) return null;
                    if (pile.Ring && w.Turn != null) return Ring.Spot(pile.X, pile.Y, w.Turn.Value, Ring.Lay);
                    return (pile.X, pile.Y);
                default:
                    var chair = s.Chairs.Find(c => c.Id == w.Chair);
                    return chair == null ? null : Ring.SeatPoint(chair.Angle, Ring.SeatRadius - 1.2);
            }
        }

        void Park(CardNode n, Transform parent)
        {
            if (n.Id == Lifted) return;
            n.Move(parent);
        }

        /** Стол пуст — ушли из-за него. */
        public void Clear()
        {
            foreach (var n in cards.Values) Destroy(n.gameObject);
            cards.Clear();
            foreach (var n in seats.Values) Destroy(n.gameObject);
            seats.Clear();
            foreach (var m in marks) Destroy(m.gameObject);
            marks.Clear();
            Lifted = null;
            Moving = null;
        }

        public SeatNode Seat(string id) => seats.TryGetValue(id, out var s) ? s : null;
    }
}
