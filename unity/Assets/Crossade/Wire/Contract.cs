// КОНТРАКТ СТОЛА НА C# — те же вещи, что `server/src/table/contract.ts`, и ни одной своей.
//
// Сервер — хозяин формы: здесь она повторена руками, и расходиться ей не даёт эталон
// (`Tests/Editor/Fixtures/wire.json`, пишет его `server/src/table/wireFixture.test.ts`). Каждый тип
// читается из дерева (`Read`) и пишется обратно (`Write`); тест сверяет, что записанное совпадает с
// прочитанным до поля. Поле, которое сервер добавит, а здесь его нет, потеряется при записи — и тест
// это покажет.

using System.Collections.Generic;

namespace Crossade.Wire
{
    public static class Protocol
    {
        /** `PROTOCOL` сервера, под который написан этот клиент. */
        public const int Number = 2;
        public const string Room = "table_room";
        public const string StaleClient = "stale client";
        public const string RoomClosed = "room closed";
        public const string MainPile = "deck";
        public const int CarryEveryMs = 50;
        public const int HoldEveryMs = 5000;
    }

    /** Имена сообщений Colyseus (`MSG`). */
    public static class Msg
    {
        public const string Hello = "hello", Welcome = "welcome", Intent = "intent", Patch = "patch", Refused = "refused";
        public const string Carry = "carry", Say = "say", Eyes = "eyes", Minds = "minds", Pulse = "pulse", Ping = "ping", Log = "log";
    }

    public sealed class Person
    {
        public string Key, Name, Ink, Door, Photo, Seat, Username, Brain;
        public bool Bot;

        public static Person Read(object t) => t == null ? null : new Person
        {
            Key = t.Str("key"), Name = t.Str("name"), Ink = t.Str("ink"), Door = t.Str("door"), Photo = t.Str("photo"),
            Seat = t.Str("seat"), Username = t.Str("username"), Bot = t.Flag("bot"), Brain = t.Str("brain"),
        };

        public object Write() => new Fields().Put("key", Key).Put("name", Name).Put("ink", Ink).Put("door", Door).Put("photo", Photo)
            .Put("seat", Seat).Put("username", Username).Mark("bot", Bot).Put("brain", Brain).Map;
    }

    public sealed class Face
    {
        public string Rank, Suit;

        public static Face Read(object t) => t == null ? null : new Face { Rank = t.Str("rank"), Suit = t.Str("suit") };
        public object Write() => new Fields().Put("rank", Rank).Put("suit", Suit).Map;
    }

    /** Где лежит вещь: `deck` (стопка), `hand` (рука стула) или `felt` (сукно). */
    public sealed class Where
    {
        public string In;
        public string Pile;
        public int? I;
        public double? Turn;
        public string Chair;
        public double X, Y, Angle;
        public bool Up, Under;

        public static Where Deck(string pile, int? i = null, double? turn = null) => new() { In = "deck", Pile = pile, I = i, Turn = turn };
        public static Where Hand(string chair, int i) => new() { In = "hand", Chair = chair, I = i };
        public static Where Felt(double x, double y, bool up, double angle) => new() { In = "felt", X = x, Y = y, Up = up, Angle = angle };

        public static Where Read(object t)
        {
            if (t == null) return null;
            var w = new Where { In = t.Str("in") };
            switch (w.In)
            {
                case "deck": w.Pile = t.Str("pile"); w.I = t.IntOrNull("i"); w.Turn = t.NumOrNull("turn"); break;
                case "hand": w.Chair = t.Str("chair"); w.I = t.Int("i"); break;
                case "felt": w.X = t.Num("x"); w.Y = t.Num("y"); w.Up = t.Flag("up"); w.Angle = t.Num("angle"); w.Under = t.Flag("under"); break;
            }
            return w;
        }

        public object Write()
        {
            var f = new Fields().Put("in", In);
            switch (In)
            {
                case "deck": f.Put("pile", Pile).Put("i", I).Put("turn", Turn); break;
                case "hand": f.Put("chair", Chair).Put("i", I ?? 0); break;
                case "felt": f.Put("x", X).Put("y", Y).Put("up", Up).Put("angle", Angle).Mark("under", Under); break;
            }
            return f.Map;
        }
    }

    /** Карта глазами зрителя; на сукне — с местом (`FeltCard` в TS: здесь один класс, `OnFelt`). */
    public sealed class Card
    {
        public string Id;
        public Face Face;
        /** Перевёрнута. На сукне — сторона, и она есть всегда. */
        public bool? Up;
        public double? Turn;
        public bool OnFelt;
        public double X, Y, Angle;
        public bool Under;

        public static Card Read(object t) => t == null ? null : new Card { Id = t.Str("id"), Face = Face.Read(t.Get("face")), Up = t.FlagOrNull("up"), Turn = t.NumOrNull("turn") };

        public static Card ReadFelt(object t)
        {
            var c = Read(t);
            c.OnFelt = true;
            c.Up = t.Flag("up");
            c.X = t.Num("x");
            c.Y = t.Num("y");
            c.Angle = t.Num("angle");
            c.Under = t.Flag("under");
            return c;
        }

        public Card Clone() => (Card)MemberwiseClone();

        public object Write()
        {
            var f = new Fields().Put("id", Id).Put("face", Face?.Write()).Put("up", Up).Put("turn", Turn);
            if (OnFelt) f.Put("up", Up ?? false).Put("x", X).Put("y", Y).Put("angle", Angle).Mark("under", Under);
            return f.Map;
        }
    }

    public sealed class HandPose
    {
        public bool Fan = true, Shrink, Tuck;

        public static HandPose Read(object t) => t == null ? new HandPose() : new HandPose { Fan = t.Flag("fan"), Shrink = t.Flag("shrink"), Tuck = t.Flag("tuck") };
        public object Write() => new Fields().Put("fan", Fan).Put("shrink", Shrink).Put("tuck", Tuck).Map;
    }

    public sealed class Chair
    {
        public string Id, Owner;
        public bool Lock, Hide, Reject, Forever, Croupier, Even;
        public double Angle;
        public HandPose Pose = new();
        public List<Card> Hand = new();

        public static Chair Read(object t)
        {
            var c = new Chair
            {
                Id = t.Str("id"), Owner = t.Str("owner"), Lock = t.Flag("lock"), Hide = t.Flag("hide"), Reject = t.Flag("reject"),
                Forever = t.Flag("forever"), Croupier = t.Flag("croupier"), Even = t.Flag("even"), Angle = t.Num("angle"), Pose = HandPose.Read(t.Get("pose")),
            };
            foreach (var x in t.Arr("hand")) c.Hand.Add(Card.Read(x));
            return c;
        }

        public object Write()
        {
            var hand = new List<object>();
            foreach (var c in Hand) hand.Add(c.Write());
            return new Fields().Put("id", Id).Always("owner", Owner).Put("lock", Lock).Put("hide", Hide).Put("reject", Reject).Put("forever", Forever)
                .Mark("croupier", Croupier).Mark("even", Even).Put("angle", Angle).Put("pose", Pose.Write()).Put("hand", hand).Map;
        }
    }

    /** Стопка: место, флаги, карты снизу вверх (`DeckSpot` + `Pile`). */
    public sealed class Pile
    {
        public string Id, Pose, Name;
        public double X, Y, Angle;
        public bool Zone, Forever, Pin, Lock, Shut, Seal;
        public List<string> Below = new();
        public List<Card> Cards = new();
        public int Shuffles;

        public bool Ring => Pose == "ring";

        public static Pile ReadSpot(object t, Pile into = null)
        {
            var p = into ?? new Pile();
            p.X = t.Num("x"); p.Y = t.Num("y"); p.Pose = t.Str("pose"); p.Name = t.Str("name"); p.Zone = t.Flag("zone");
            p.Forever = t.Flag("forever"); p.Pin = t.Flag("pin"); p.Lock = t.Flag("lock"); p.Shut = t.Flag("shut"); p.Seal = t.Flag("seal");
            p.Angle = t.Num("angle"); p.Below = t.Strs("below");
            return p;
        }

        public static Pile Read(object t)
        {
            var p = ReadSpot(t);
            p.Id = t.Str("id");
            p.Shuffles = t.Int("shuffles");
            foreach (var x in t.Arr("cards")) p.Cards.Add(Card.Read(x));
            return p;
        }

        public object Write()
        {
            var cards = new List<object>();
            foreach (var c in Cards) cards.Add(c.Write());
            return new Fields().Put("id", Id).Put("x", X).Put("y", Y).Put("pose", Pose).Put("name", Name).Mark("zone", Zone).Put("forever", Forever)
                .Put("pin", Pin).Put("lock", Lock).Put("shut", Shut).Put("seal", Seal).Put("angle", Angle).Put("below", Tree.Box(Below))
                .Put("cards", cards).Put("shuffles", Shuffles).Map;
        }
    }

    public sealed class TableRules
    {
        public bool DropEmptyChairs = true, TurnMark = true;
        public string Faces = "classic", Back = "plaid";

        public static TableRules Read(object t) => t == null ? new TableRules() : new TableRules
        {
            DropEmptyChairs = t.Flag("dropEmptyChairs"), TurnMark = t.Flag("turnMark"), Faces = t.Str("faces"), Back = t.Str("back"),
        };

        public object Write() => new Fields().Put("dropEmptyChairs", DropEmptyChairs).Put("faces", Faces).Put("back", Back).Put("turnMark", TurnMark).Map;
    }

    /** След карты: кто последним переносил, откуда и когда. */
    public sealed class Trail
    {
        public string By, ByName, From, Hand, Pile;
        public bool Deal, Thrown;
        public double At;

        public static Trail Read(object t) => t == null ? null : new Trail
        {
            By = t.Str("by"), ByName = t.Str("byName"), Deal = t.Flag("deal"), From = t.Str("from"), Hand = t.Str("hand"), Pile = t.Str("pile"),
            Thrown = t.Flag("thrown"), At = t.Num("at"),
        };

        public object Write() => new Fields().Put("by", By).Put("byName", ByName).Mark("deal", Deal).Put("from", From).Put("hand", Hand)
            .Put("pile", Pile).Mark("thrown", Thrown).Put("at", At).Map;
    }

    public sealed class Play
    {
        public string Turn, Closer, Loser;
        public List<string> Lay = new();
        public bool Take;

        public static Play Read(object t) => t == null ? null : new Play { Turn = t.Str("turn"), Closer = t.Str("closer"), Loser = t.Str("loser"), Lay = t.Strs("lay"), Take = t.Flag("take") };

        public object Write() => new Fields().Always("turn", Turn).Always("closer", Closer).Put("lay", Tree.Box(Lay)).Put("take", Take).Always("loser", Loser).Map;
    }

    /** Всё, что зритель знает о столе. */
    public sealed class Snapshot
    {
        public int V;
        public List<Person> People = new();
        public List<Chair> Chairs = new();
        /** В порядке «кто сверху». */
        public List<Pile> Piles = new();
        public List<Card> Felt = new();
        public Dictionary<string, Trail> Trails = new();
        public Dictionary<string, string> Locks = new();
        public Dictionary<string, string> Picks = new();
        public TableRules Rules = new();
        public string Admin, Dealer;
        public List<string> Rights = new();
        public Play Play;

        public static Snapshot Read(object t)
        {
            var s = new Snapshot { V = t.Int("v"), Rules = TableRules.Read(t.Get("rules")), Admin = t.Str("admin"), Dealer = t.Str("dealer"), Rights = t.Strs("rights"), Play = Play.Read(t.Get("play")) };
            foreach (var x in t.Arr("people")) s.People.Add(Person.Read(x));
            foreach (var x in t.Arr("chairs")) s.Chairs.Add(Chair.Read(x));
            foreach (var x in t.Arr("piles")) s.Piles.Add(Pile.Read(x));
            foreach (var x in t.Arr("felt")) s.Felt.Add(Card.ReadFelt(x));
            if (t.Obj("trails") is { } trails) foreach (var kv in trails) s.Trails[kv.Key] = Trail.Read(kv.Value);
            if (t.Obj("locks") is { } locks) foreach (var kv in locks) s.Locks[kv.Key] = kv.Value as string;
            if (t.Obj("picks") is { } picks) foreach (var kv in picks) s.Picks[kv.Key] = kv.Value as string;
            return s;
        }

        public object Write()
        {
            List<object> All<T>(List<T> xs, System.Func<T, object> w)
            {
                var o = new List<object>();
                foreach (var x in xs) o.Add(w(x));
                return o;
            }
            var trails = new Dictionary<string, object>();
            foreach (var kv in Trails) trails[kv.Key] = kv.Value.Write();
            var locks = new Dictionary<string, object>();
            foreach (var kv in Locks) locks[kv.Key] = kv.Value;
            var picks = new Dictionary<string, object>();
            foreach (var kv in Picks) picks[kv.Key] = kv.Value;
            return new Fields().Put("v", V).Put("people", All(People, p => p.Write())).Put("chairs", All(Chairs, c => c.Write()))
                .Put("piles", All(Piles, p => p.Write())).Put("felt", All(Felt, c => c.Write())).Put("trails", trails).Put("locks", locks)
                .Put("picks", picks).Put("rules", Rules.Write()).Always("admin", Admin).Always("dealer", Dealer).Put("rights", Tree.Box(Rights))
                .Always("play", Play?.Write()).Map;
        }

        public Snapshot Clone() => Read(Write());
    }

    /** Операция патча (`Op`). Поля — объединение всех видов; какие заполнены, решает `T`. */
    public sealed class Op
    {
        public string T;
        public Person Person;
        public string Key, Id, By, ByName, Pile;
        public Chair Chair;
        public string ChairId;
        public List<Card> Felt;
        public Card Card;
        public Where From, To;
        public Trail Trail;
        public List<string> Ids;
        public List<(string chair, int n)> Parts;
        public bool Up, Shuffled, Top;
        public List<Card> Cards;
        /** `spot`: новое место стопки; `null` — стопка исчезла. */
        public Pile Spot;
        public TableRules Rules;
        public List<string> Rights;
        public Play Play;

        public static Op Read(object t)
        {
            var op = new Op { T = t.Str("t") };
            switch (op.T)
            {
                case "join": op.Person = Person.Read(t.Get("person")); break;
                case "leave": op.Key = t.Str("key"); break;
                case "chair": op.Chair = Chair.Read(t.Get("chair")); break;
                case "unchair":
                    op.Id = t.Str("id");
                    op.Felt = new List<Card>();
                    foreach (var x in t.Arr("felt")) op.Felt.Add(Card.ReadFelt(x));
                    break;
                case "lock": op.Id = t.Str("id"); op.By = t.Str("by"); break;
                case "unlock": op.Id = t.Str("id"); break;
                case "move": op.Card = Card.Read(t.Get("card")); op.From = Where.Read(t.Get("from")); op.To = Where.Read(t.Get("to")); op.Trail = Trail.Read(t.Get("trail")); break;
                case "order": op.ChairId = t.Str("chair"); op.Ids = t.Strs("ids"); break;
                case "dealt":
                    op.By = t.Str("by"); op.ByName = t.Str("byName"); op.Parts = new List<(string, int)>();
                    foreach (var x in t.Arr("parts")) op.Parts.Add((x.Str("chair"), x.Int("n")));
                    break;
                case "turn": op.Card = Card.Read(t.Get("card")); op.Up = t.Flag("up"); op.Trail = Trail.Read(t.Get("trail")); break;
                case "deck":
                    op.Pile = t.Str("pile"); op.Shuffled = t.Flag("shuffled"); op.Cards = new List<Card>();
                    foreach (var x in t.Arr("cards")) op.Cards.Add(Card.Read(x));
                    break;
                case "spot": op.Pile = t.Str("pile"); op.Spot = t.Get("spot") is { } spot ? Wire.Pile.ReadSpot(spot) : null; op.Top = t.Flag("top"); break;
                case "pick": op.Ids = t.Strs("ids"); op.By = t.Str("by"); break;
                case "rules": op.Rules = TableRules.Read(t.Get("rules")); break;
                case "admin":
                case "dealer": op.Key = t.Str("key"); op.Rights = t.Strs("rights"); break;
                case "play": op.Play = Play.Read(t.Get("play")); break;
                case "unmake": op.Ids = t.Strs("ids"); break;
            }
            return op;
        }
    }

    public sealed class Patch
    {
        public int V;
        public List<Op> Ops = new();

        public static Patch Read(object t)
        {
            var p = new Patch { V = t.Int("v") };
            foreach (var x in t.Arr("ops")) p.Ops.Add(Op.Read(x));
            return p;
        }
    }
}
