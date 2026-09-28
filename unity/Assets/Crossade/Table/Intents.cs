// НАМЕРЕНИЯ — то, что клиент просит у стола (`Intent` в `contract.ts`). Сервер решает, случились ли они.

using System.Collections.Generic;
using Crossade.Wire;

namespace Crossade.Table
{
    public static class Intents
    {
        static Dictionary<string, object> Of(string t) => new() { ["t"] = t };

        public static Dictionary<string, object> Sync() => Of("sync");
        public static Dictionary<string, object> Grab(string id) { var o = Of("grab"); o["id"] = id; return o; }
        public static Dictionary<string, object> Hold(string id) { var o = Of("hold"); o["id"] = id; return o; }
        public static Dictionary<string, object> Release(string id) { var o = Of("release"); o["id"] = id; return o; }
        public static Dictionary<string, object> Turn(string id) { var o = Of("turn"); o["id"] = id; return o; }
        public static Dictionary<string, object> Grip(string pile) { var o = Of("grip"); o["pile"] = pile; return o; }

        public static Dictionary<string, object> Drop(string id, Where to, bool thrown = false)
        {
            var o = Of("drop");
            o["id"] = id;
            o["to"] = to.Write();
            if (thrown) o["throw"] = true;
            return o;
        }

        public static Dictionary<string, object> DeckMove(string pile, double x, double y, double? angle = null)
        {
            var o = Of("deckMove");
            o["pile"] = pile;
            o["x"] = x;
            o["y"] = y;
            if (angle != null) o["angle"] = angle.Value;
            return o;
        }

        public static Dictionary<string, object> DeckDo(string pile, string how) { var o = Of("deckDo"); o["pile"] = pile; o["how"] = how; return o; }

        public static Dictionary<string, object> Pose(string chair, bool? fan = null, bool? shrink = null, bool? tuck = null)
        {
            var pose = new Dictionary<string, object>();
            if (fan != null) pose["fan"] = fan.Value;
            if (shrink != null) pose["shrink"] = shrink.Value;
            if (tuck != null) pose["tuck"] = tuck.Value;
            var o = Of("pose");
            o["chair"] = chair;
            o["pose"] = pose;
            return o;
        }

        public static Dictionary<string, object> DeckPin(string pile, bool on) { var o = Of("deckPin"); o["pile"] = pile; o["on"] = on; return o; }
        public static Dictionary<string, object> DeckForever(string pile, bool on) { var o = Of("deckForever"); o["pile"] = pile; o["on"] = on; return o; }
        /** `guard` — `lock`, `shut` или `seal` (`PILE_GUARDS`). */
        public static Dictionary<string, object> DeckGuard(string pile, string guard, bool on) { var o = Of("deckGuard"); o["pile"] = pile; o["guard"] = guard; o["on"] = on; return o; }

        public static Dictionary<string, object> Arrange(string how) { var o = Of("arrange"); o["how"] = how; return o; }
        public static Dictionary<string, object> Flip() => Of("flip");
        public static Dictionary<string, object> Sit(string chair) { var o = Of("sit"); o["chair"] = chair; return o; }
        public static Dictionary<string, object> Stand() => Of("stand");
        public static Dictionary<string, object> Crew(string act, string chair = null) { var o = Of("crew"); o["act"] = act; if (chair != null) o["chair"] = chair; return o; }
        public static Dictionary<string, object> Bot(string chair, string act, string brain = null) { var o = Of("bot"); o["chair"] = chair; o["act"] = act; if (brain != null) o["brain"] = brain; return o; }
        public static Dictionary<string, object> Chair(string act, string chair = null) { var o = Of("chair"); o["act"] = act; if (chair != null) o["chair"] = chair; return o; }
        public static Dictionary<string, object> FlipChair(string chair) { var o = Of("flip"); o["chair"] = chair; return o; }
        public static Dictionary<string, object> Flag(string chair, string flag, bool on) { var o = Of("flag"); o["chair"] = chair; o["flag"] = flag; o["on"] = on; return o; }
    }

    /** Слова для человека — `REFUSAL_SAYS` сервера. */
    public static class Says
    {
        public static readonly Dictionary<string, string> Refusals = new()
        {
            ["not-your-turn"] = "Сейчас не твой ход",
            ["not-yours"] = "Это не твоё",
            ["rejects"] = "Рука не принимает карты",
            ["beats"] = "Этой картой не побить",
            ["no-right"] = "Нет права на это",
            ["locked"] = "Занято",
            ["even-hand"] = "Ровная рука переворачивается целиком",
            ["chair-locked"] = "Стул закрыт",
            ["not-top"] = "Брать можно только верхнюю",
            ["taken"] = "Уже занято",
            ["full"] = "Больше не помещается",
            ["gone"] = "Этого уже нет на столе",
        };

        public static string Refusal(string why) => Refusals.TryGetValue(why, out var s) ? s : "";
    }
}
