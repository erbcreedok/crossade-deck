// ПАТЧ НА СТОРОНЕ КЛИЕНТА — `server/src/table/patch.ts` на C#: как снимок становится следующим.
// Сверяется с сервером эталоном (`WireTests`). Снимок меняется на месте: у клиента он один.

using System.Collections.Generic;
using System.Linq;
using Crossade.Wire;

namespace Crossade.Table
{
    public static class Patching
    {
        /** Патч не следующей версии — что-то потерялось, и стол надо просить целиком. */
        public static bool NeedsSync(Snapshot s, Patch p) => p.V != s.V + 1;

        public static void Apply(Snapshot s, Patch p)
        {
            foreach (var op in p.Ops) Apply(s, op);
            s.V = p.V;
        }

        public static void Apply(Snapshot s, Op op)
        {
            switch (op.T)
            {
                case "join":
                {
                    var i = s.People.FindIndex(x => x.Key == op.Person.Key);
                    if (i >= 0) s.People[i] = op.Person;
                    else s.People.Add(op.Person);
                    return;
                }
                case "leave":
                    s.People.RemoveAll(x => x.Key == op.Key);
                    return;
                case "chair":
                {
                    var i = s.Chairs.FindIndex(x => x.Id == op.Chair.Id);
                    if (i >= 0) s.Chairs[i] = op.Chair;
                    else s.Chairs.Add(op.Chair);
                    return;
                }
                case "unchair":
                    s.Chairs.RemoveAll(x => x.Id == op.Id);
                    s.Felt.AddRange(op.Felt);
                    return;
                case "unmake":
                {
                    var gone = new HashSet<string>(op.Ids);
                    s.Felt.RemoveAll(x => gone.Contains(x.Id));
                    foreach (var pile in s.Piles) pile.Cards.RemoveAll(x => gone.Contains(x.Id));
                    foreach (var chair in s.Chairs) chair.Hand.RemoveAll(x => gone.Contains(x.Id));
                    foreach (var id in op.Ids)
                    {
                        s.Locks.Remove(id);
                        s.Picks.Remove(id);
                        s.Trails.Remove(id);
                    }
                    return;
                }
                case "lock":
                    s.Locks[op.Id] = op.By;
                    return;
                case "unlock":
                    s.Locks.Remove(op.Id);
                    return;
                case "order":
                {
                    var chair = s.Chairs.Find(x => x.Id == op.ChairId);
                    if (chair == null) return;
                    var byId = chair.Hand.ToDictionary(c => c.Id);
                    chair.Hand = op.Ids.Select(id => byId.TryGetValue(id, out var c) ? c : new Card { Id = id }).ToList();
                    return;
                }
                case "move":
                {
                    // Своего угла в зоне карта в `move` может не нести: он лежит там, откуда её поднимут.
                    var card = op.Card.Clone();
                    card.Turn ??= HeldTurn(s, card.Id);
                    Lift(s, card.Id, op.From);
                    Place(s, card, op.To, WhenceOf(s, op.From));
                    if (op.Trail != null) s.Trails[card.Id] = op.Trail;
                    return;
                }
                case "turn":
                {
                    var felt = s.Felt.Find(x => x.Id == op.Card.Id);
                    var pile = s.Piles.Find(x => x.Cards.Any(c => c.Id == op.Card.Id));
                    var chair = s.Chairs.Find(x => x.Hand.Any(c => c.Id == op.Card.Id));
                    if (felt != null)
                    {
                        felt.Up = op.Up;
                        felt.Face = op.Card.Face;
                    }
                    else if (pile != null) pile.Cards = pile.Cards.Select(c => c.Id == op.Card.Id ? op.Card : c).ToList();
                    else if (chair != null) chair.Hand = chair.Hand.Select(c => c.Id == op.Card.Id ? op.Card : c).ToList();
                    s.Trails[op.Card.Id] = op.Trail;
                    return;
                }
                case "deck":
                {
                    var pile = s.Piles.Find(x => x.Id == op.Pile);
                    if (pile == null) return;
                    pile.Cards = op.Cards;
                    if (op.Shuffled) pile.Shuffles += 1;
                    var here = new HashSet<string>();
                    foreach (var p in s.Piles) foreach (var c in p.Cards) here.Add(c.Id);
                    foreach (var c in s.Felt) here.Add(c.Id);
                    foreach (var ch in s.Chairs) foreach (var c in ch.Hand) here.Add(c.Id);
                    foreach (var id in s.Trails.Keys.ToList()) if (!here.Contains(id)) s.Trails.Remove(id);
                    return;
                }
                case "spot":
                {
                    var i = s.Piles.FindIndex(x => x.Id == op.Pile);
                    var was = i >= 0 ? s.Piles[i] : null;
                    if (i >= 0) s.Piles.RemoveAt(i);
                    if (op.Spot == null) return;
                    var pile = op.Spot;
                    pile.Id = op.Pile;
                    pile.Cards = was?.Cards ?? new List<Card>();
                    pile.Shuffles = was?.Shuffles ?? 0;
                    if (op.Top || i < 0) s.Piles.Add(pile);
                    else s.Piles.Insert(i, pile);
                    return;
                }
                case "pick":
                    foreach (var id in op.Ids)
                    {
                        if (op.By == null) s.Picks.Remove(id);
                        else s.Picks[id] = op.By;
                    }
                    return;
                case "rules":
                    s.Rules = op.Rules;
                    return;
                case "admin":
                    s.Admin = op.Key;
                    s.Rights = op.Rights;
                    return;
                case "dealer":
                    s.Dealer = op.Key;
                    s.Rights = op.Rights;
                    return;
                case "play":
                    s.Play = op.Play;
                    return;
                // Раздача состояния не меняет: карты уже разъехались своими движениями. Это слово для журнала.
                case "dealt":
                    return;
            }
        }

        static double WhenceOf(Snapshot s, Where from)
        {
            if (from.In == "hand") return s.Chairs.Find(x => x.Id == from.Chair)?.Angle ?? 0;
            if (from.In == "felt") return Ring.TurnOfPlace(from.X, from.Y);
            var pile = s.Piles.Find(x => x.Id == from.Pile);
            return pile != null ? Ring.TurnOfPlace(pile.X, pile.Y) : 0;
        }

        static double? HeldTurn(Snapshot s, string id)
        {
            foreach (var pile in s.Piles)
                foreach (var c in pile.Cards)
                    if (c.Id == id) return c.Turn;
            return null;
        }

        static void Lift(Snapshot s, string id, Where from)
        {
            if (from.In == "felt") foreach (var pile in s.Piles) pile.Below.Remove(id);
            if (from.In == "deck") s.Piles.Find(x => x.Id == from.Pile)?.Cards.RemoveAll(c => c.Id == id);
            else if (from.In == "felt") s.Felt.RemoveAll(c => c.Id == id);
            else s.Chairs.Find(x => x.Id == from.Chair)?.Hand.RemoveAll(c => c.Id == id);
        }

        static void Place(Snapshot s, Card card, Where to, double whence)
        {
            if (to.In == "deck")
            {
                var pile = s.Piles.Find(x => x.Id == to.Pile);
                if (pile == null) return;
                // Круг кладёт по углу тем же законом, что и стол: занято — встанет рядом.
                if (pile.Ring)
                {
                    var busy = pile.Cards.Where(c => c.Turn.HasValue).Select(c => c.Turn.Value).ToList();
                    card.Turn = Ring.Landing(to.Turn ?? card.Turn ?? whence, busy);
                    pile.Cards.Add(card);
                    return;
                }
                if (to.I == null) pile.Cards.Add(card);
                else pile.Cards.Insert(System.Math.Max(0, System.Math.Min(pile.Cards.Count, to.I.Value)), card);
            }
            else if (to.In == "felt")
            {
                card.Turn = null;
                card.OnFelt = true;
                card.X = to.X;
                card.Y = to.Y;
                card.Up = to.Up;
                card.Angle = to.Angle;
                card.Under = to.Under;
                s.Felt.Add(card);
            }
            else
            {
                card.Turn = null;
                card.OnFelt = false;
                card.X = card.Y = card.Angle = 0;
                card.Under = false;
                s.Chairs.Find(x => x.Id == to.Chair)?.Hand.Insert(to.I ?? 0, card);
            }
        }
    }
}
