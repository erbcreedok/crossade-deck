// ПАЛЕЦ — жесты над столом. Один источник касаний (мышь или экран, `Pointer`) и одна машина жестов:
//
//   карта (сукно, верх стопки, своя рука)  — зажал и повёл: карта под пальцем, отпустил — легла туда, где палец:
//                                            в руку (над низом экрана), в стопку, в круг хода, на сукно;
//   двойной тап по карте                   — перевернуть;
//   пустое сукно                           — вести: поворот вокруг стола и наклон; два пальца — приближение.
//
// Тот же вход вызывают проверки (`Down`/`Move`/`Up`): жест в тесте и жест пальцем — один код.

using System.Collections.Generic;
using Crossade.Table;
using Crossade.View;
using Crossade.Wire;
using UnityEngine;

namespace Crossade.Play
{
    public sealed class Finger
    {
        /** Сдвиг, после которого нажатие — уже не тап. */
        const float TAP_PX = 10;
        const float DOUBLE_TAP_S = .35f;
        /** Насколько близко к середине стопки надо отпустить, чтобы карта легла в неё, — в единицах стола. */
        const float PILE_REACH = .9f;
        const float SEAT_REACH = 1.1f;

        readonly Store store;
        readonly Board board;
        readonly Rig rig;
        /** В AR палец по сукну двигает стол, щипок — меняет его размер. */
        public ArMode Ar;

        enum Mode { None, Card, Orbit, Seat }
        /** Тап по стулу — открыть его окно. */
        public System.Action<string> SeatTapped;
        /** Тап мимо всего — закрыть окна. */
        public System.Action Missed;
        string seatDown;
        Mode mode;
        Vector2 downAt, lastAt;
        float downTime;
        bool moved;
        CardNode held;
        Where from;
        Card heldCard;
        float carryAt, holdAt;
        /** Где стояла карта в руке, когда её взяли: из-под неё натягивают рогатку. */
        Rect slot;

        /** Рогатка натянута (`Sling`): что видит экран — заряд, куда полетит, долетит ли. */
        public sealed class Aim
        {
            public double Charge, Dist;
            public bool Armed, Valid;
            public float At;
            /** Карта в руке и точка попадания — пиксели экрана. */
            public Vector2 From, Target;
            /** Куда ляжет, в осях стола. */
            public Vector2 Land;
        }
        public Aim Sling { get; private set; }
        string lastTapId;
        float lastTapTime = -1;
        /** Второй палец — щипок. */
        readonly Dictionary<int, Vector2> touches = new();
        float pinch0, zoom0;

        public Finger(Store store, Board board, Rig rig)
        {
            this.store = store;
            this.board = board;
            this.rig = rig;
        }

        Camera Cam => Ar != null && Ar.On ? Ar.Cam : rig.Cam;

        public void Down(int id, Vector2 px, float now)
        {
            touches[id] = px;
            if (touches.Count == 2)
            {
                // Второй палец: что бы ни делал первый, теперь это щипок.
                Cancel();
                var p = new List<Vector2>(touches.Values);
                pinch0 = Vector2.Distance(p[0], p[1]);
                zoom0 = rig.Zoom;
                return;
            }
            if (touches.Count > 2) return;
            downAt = lastAt = px;
            downTime = now;
            moved = false;
            var hit = Pick(px);
            if (hit != null)
            {
                (held, from, heldCard) = hit.Value;
                mode = Mode.Card;
                slot = from.In == "hand" && board.Hand != null && from.I < board.Hand.Slots.Length ? board.Hand.Slots[from.I ?? 0] : default;
                return;
            }
            seatDown = SeatUnder(px);
            mode = seatDown != null ? Mode.Seat : Mode.Orbit;
        }

        public void Move(int id, Vector2 px, float now)
        {
            if (!touches.ContainsKey(id)) return;
            touches[id] = px;
            if (touches.Count == 2)
            {
                var p = new List<Vector2>(touches.Values);
                var d = Vector2.Distance(p[0], p[1]);
                if (pinch0 <= 1) return;
                if (Ar != null && Ar.On)
                {
                    Ar.Scale(d / pinch0);
                    pinch0 = d;
                }
                else rig.Zoom = Mathf.Clamp(zoom0 * d / pinch0, Rig.MinZoom, Rig.MaxZoom);
                return;
            }
            if (!moved && Vector2.Distance(px, downAt) > TAP_PX)
            {
                moved = true;
                if (mode == Mode.Card) Lift();
                // Со стула тянут — это вращение стола, а не тап.
                if (mode == Mode.Seat) mode = Mode.Orbit;
            }
            if (!moved) return;
            if (mode == Mode.Orbit && Ar != null && Ar.On) Ar.Drag(lastAt, px);
            else if (mode == Mode.Orbit)
            {
                var d = px - lastAt;
                rig.Yaw += d.x * 180f / Cam.pixelWidth;
                rig.Pitch -= d.y * 90f / Cam.pixelHeight;
            }
            else if (mode == Mode.Card && held != null)
            {
                if (!Steer(px, now)) Follow(px);
                if (now - carryAt >= Protocol.CarryEveryMs / 1000f)
                {
                    carryAt = now;
                    store.CarryOut(heldCard.Id, Sling != null ? Sling.Armed && Sling.Valid ? Landing() : from : Target(px));
                }
                if (now - holdAt >= Protocol.HoldEveryMs / 1000f)
                {
                    holdAt = now;
                    store.Act(Intents.Hold(heldCard.Id));
                }
            }
            lastAt = px;
        }

        public void Up(int id, Vector2 px, float now)
        {
            if (!touches.Remove(id)) return;
            if (touches.Count > 0) return;
            if (mode == Mode.Card && heldCard != null)
            {
                if (Sling != null) Loose();
                else if (moved) Drop(px);
                else Tap(heldCard.Id, now);
            }
            Sling = null;
            if (mode == Mode.Seat && !moved) SeatTapped?.Invoke(seatDown);
            if (mode == Mode.Orbit && !moved) Missed?.Invoke();
            mode = Mode.None;
            held = null;
            heldCard = null;
        }

        // ── рогатка ─────────────────────────────────────────────────────────────────────────────

        /** Натяг по пальцу — только у карты из моей руки. `true` — палец сейчас под картой. */
        bool Steer(Vector2 px, float now)
        {
            if (from.In != "hand" || from.Chair != store.MyChair?.Id || board.Hand == null) return false;
            var dist = (slot.yMin - px.y) / board.Hand.Dpr;
            if (!Play.Sling.Tensed(dist))
            {
                if (Sling != null)
                {
                    Sling = null;
                    held.Held = true;
                    held.Move(board.Table);
                }
                return false;
            }
            if (Sling == null)
            {
                Sling = new Aim { At = now };
                // Карта не едет за пальцем — стоит в руке и пружинит.
                held.Held = false;
                held.Move(board.Hand.transform);
            }
            Sling.Dist = dist;
            Retarget();
            return true;
        }

        /** Заряд идёт, пока палец держит: зовётся каждый кадр. */
        public void Tick(float now)
        {
            if (Sling == null) return;
            Sling.Charge = Play.Sling.Charged(Sling.Charge, Sling.Dist, now - Sling.At);
            Sling.At = now;
            if (Sling.Charge >= 1) Sling.Armed = true;
            Retarget();
        }

        /** Цель — центр камеры; на сукне ли она. */
        void Retarget()
        {
            var centre = new Vector2(Cam.pixelWidth / 2f, Cam.pixelHeight / 2f);
            Sling.From = slot.center + Vector2.up * slot.height / 2;
            Sling.Target = centre;
            var desk = board.ToDesk(Cam.ScreenPointToRay(centre));
            Sling.Land = desk ?? Vector2.zero;
            Sling.Valid = desk != null && desk.Value.magnitude <= Ring.TableRadius - Play.Sling.Edge;
        }

        Where Landing() => Where.Felt(Sling.Land.x, Sling.Land.y, heldCard.Up != true, -board.MyAngle);

        void Loose()
        {
            switch (Play.Sling.OnRelease(Sling.Armed, Sling.Valid))
            {
                case Play.Sling.Release.Throw:
                    store.Act(Intents.Drop(heldCard.Id, Landing(), thrown: true));
                    break;
                default:
                    store.Act(Intents.Release(heldCard.Id));
                    break;
            }
            Unlift();
        }

        void Cancel()
        {
            Sling = null;
            if (mode == Mode.Card && moved && heldCard != null)
            {
                store.Act(Intents.Release(heldCard.Id));
                Unlift();
            }
            mode = Mode.None;
            held = null;
            heldCard = null;
        }

        void Tap(string id, float now)
        {
            if (lastTapId == id && now - lastTapTime < DOUBLE_TAP_S)
            {
                store.Act(Intents.Turn(id));
                lastTapId = null;
                return;
            }
            lastTapId = id;
            lastTapTime = now;
        }

        // ── что под пальцем ─────────────────────────────────────────────────────────────────────

        (CardNode node, Where from, Card card)? Pick(Vector2 px)
        {
            var s = store.S;
            if (s == null) return null;
            var mine = store.MyChair;
            if (mine != null && board.Hand != null)
            {
                var i = board.Hand.Under(px);
                if (i >= 0 && i < mine.Hand.Count)
                {
                    var c = mine.Hand[i];
                    return (board.Node(c.Id), Where.Hand(mine.Id, i), c);
                }
            }
            // Сукно и стопки: берётся то, что сверху под лучом.
            var ray = Cam.ScreenPointToRay(px);
            var hits = Physics.RaycastAll(ray, 200);
            System.Array.Sort(hits, (a, b) => a.distance.CompareTo(b.distance));
            foreach (var hit in hits)
            {
                var node = hit.collider.GetComponent<CardNode>();
                if (node == null) continue;
                var felt = s.Felt.Find(c => c.Id == node.Id);
                if (felt != null) return (node, Where.Felt(felt.X, felt.Y, felt.Up == true, felt.Angle), felt);
                var pile = s.Piles.Find(x => x.Cards.Exists(c => c.Id == node.Id));
                if (pile == null) continue;
                // Из стопки берут верхнюю; из круга — ту, что под пальцем.
                var card = pile.Ring ? pile.Cards.Find(c => c.Id == node.Id) : pile.Cards[^1];
                return (board.Node(card.Id), Where.Deck(pile.Id), card);
            }
            return null;
        }

        string SeatUnder(Vector2 px)
        {
            foreach (var hit in Physics.RaycastAll(Cam.ScreenPointToRay(px), 200))
                if (hit.collider.GetComponent<SeatNode>() is { } seat) return seat.Id;
            return null;
        }

        void Lift()
        {
            if (held == null) return;
            board.Lifted = heldCard.Id;
            held.Held = true;
            held.Move(board.Table);
            store.Act(Intents.Grab(heldCard.Id));
            carryAt = holdAt = Time.realtimeSinceStartup;
        }

        void Unlift()
        {
            if (held != null) held.Held = false;
            board.Lifted = null;
        }

        void Follow(Vector2 px)
        {
            var desk = board.ToDesk(Cam.ScreenPointToRay(px));
            if (desk == null) return;
            var world = board.Table.TransformPoint(Board.At(desk.Value.x, desk.Value.y, .35f));
            var up = FaceUpOnFelt();
            held.Carry(world, board.Table.rotation * Quaternion.Euler(0, -board.MyAngle, 0));
            held.transform.localScale = Vector3.one;
            held.transform.GetChild(0).localRotation = Quaternion.Euler(0, 0, up ? 0 : 180);
        }

        /** Какой стороной карта ляжет на сукно: из руки — как держал (к себе лицом — лицом вверх). */
        bool FaceUpOnFelt() => from.In switch
        {
            "felt" => from.Up,
            "hand" => heldCard.Up != true,
            _ => heldCard.Up == true,
        };

        /** Куда ляжет карта, отпущенная над точкой экрана. */
        Where Target(Vector2 px)
        {
            var s = store.S;
            var mine = store.MyChair;
            if (mine != null && board.Hand != null && board.Hand.Over(px))
            {
                var at = board.Hand.SlotAt(px);
                if (from.In == "hand" && from.Chair == mine.Id && from.I < at) at -= 1;
                return Where.Hand(mine.Id, at);
            }
            var desk = board.ToDesk(Cam.ScreenPointToRay(px));
            if (desk == null) return from;
            var p = desk.Value;
            foreach (var pile in s.Piles)
            {
                var d = Vector2.Distance(p, new Vector2((float)pile.X, (float)pile.Y));
                if (pile.Ring)
                {
                    if (d <= Ring.Spread + Ring.CardH / 2)
                    {
                        var turn = Ring.TurnOfPlace(p.x - pile.X, p.y - pile.Y);
                        return Where.Deck(pile.Id, null, System.Math.Round(turn / Ring.Hour) * Ring.Hour % 360);
                    }
                    continue;
                }
                if (d <= PILE_REACH && !(from.In == "deck" && from.Pile == pile.Id)) return Where.Deck(pile.Id);
            }
            foreach (var chair in s.Chairs)
            {
                if (chair == mine) continue;
                var (sx, sy) = Ring.SeatPoint(chair.Angle, chair.Croupier ? Ring.CroupierRadius : Ring.SeatRadius);
                if (Vector2.Distance(p, new Vector2((float)sx, (float)sy)) <= SEAT_REACH) return Where.Hand(chair.Id, chair.Hand.Count);
            }
            var r = p.magnitude;
            var max = (float)Ring.TableRadius - .8f;
            if (r > max) p *= max / r;
            return Where.Felt(p.x, p.y, FaceUpOnFelt(), -board.MyAngle);
        }

        void Drop(Vector2 px)
        {
            var to = Target(px);
            store.Act(Intents.Drop(heldCard.Id, to));
            Unlift();
        }
    }

    /** Касания из Unity: экран или мышь — в `Finger`. */
    public sealed class Pointer : MonoBehaviour
    {
        public Finger Finger;
        public Rig Rig;

        void Update()
        {
            if (Finger == null) return;
            var now = Time.realtimeSinceStartup;
            Finger.Tick(now);
            if (Input.touchCount > 0)
            {
                foreach (var t in Input.touches)
                {
                    if (t.phase == TouchPhase.Began && View.Ui.Busy(t.fingerId)) continue;
                    if (t.phase == TouchPhase.Began) Finger.Down(t.fingerId, t.position, now);
                    else if (t.phase == TouchPhase.Moved || t.phase == TouchPhase.Stationary) Finger.Move(t.fingerId, t.position, now);
                    else Finger.Up(t.fingerId, t.position, now);
                }
                return;
            }
            Vector2 m = Input.mousePosition;
            if (Input.GetMouseButtonDown(0) && !View.Ui.Busy(-1)) Finger.Down(-1, m, now);
            else if (Input.GetMouseButton(0)) Finger.Move(-1, m, now);
            else if (Input.GetMouseButtonUp(0)) Finger.Up(-1, m, now);
            if (Rig != null && Mathf.Abs(Input.mouseScrollDelta.y) > .01f) Rig.Zoom = Mathf.Clamp(Rig.Zoom * (1 + Input.mouseScrollDelta.y * .08f), Rig.MinZoom, Rig.MaxZoom);
        }
    }
}
