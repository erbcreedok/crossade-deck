// ОКНО СТУЛА — тап по стулу (`tipHtml`, `croupierActsHtml`, `emptySeatActsHtml`, `mindActsHtml` у веба):
//
//   чей стул         — имя, сколько карт; пустой — «Сесть»;
//   флаги            — замок, скрыть, отклонять, вечный: свои — хозяин, чужие — по праву `hand.flags`;
//   поза чужой руки  — по праву `hand.pose`;
//   пустой стул      — распорядителю: посадить машину (чем ей думать), убрать стул;
//   машина на стуле  — распорядителю: походи, оборвать мысль, увести;
//   крупье           — дела набора комнаты по разделам (`Welcome.crew`) и свои: раздать, перемешать,
//                      ещё стул, перевернуть руку. Раздать открывает окно раздачи (`DealWindow`).

using System;
using System.Collections.Generic;
using System.Linq;
using Crossade.Table;
using Crossade.Wire;
using UnityEngine;

namespace Crossade.View
{
    public sealed class ChairWindow : MonoBehaviour
    {
        static readonly (string flag, string name)[] Flags = { ("lock", "Замок"), ("hide", "Скрыть"), ("reject", "Отклонять"), ("forever", "Вечный") };
        static readonly (string key, string name)[] Folds = { ("fan", "Веер"), ("shrink", "Сжать"), ("tuck", "Спрятать") };
        public static readonly string[] Brains = { "greedy", "claude", "flash", "ollama" };
        static readonly string[] Parts = { "игра", "колода", "рука", "стол" };

        Func<Store> store;
        RectTransform panel;
        DealWindow deal;
        public string Chair { get; private set; }

        public static ChairWindow Make(Hud hud, Func<Store> store)
        {
            var w = new GameObject("chair window", typeof(RectTransform)).AddComponent<ChairWindow>();
            w.transform.SetParent(hud.transform, false);
            Ui.Fill((RectTransform)w.transform);
            w.store = store;
            w.deal = DealWindow.Make(hud, store);
            return w;
        }

        public void Show(string chair)
        {
            Chair = chair;
            Sync();
        }

        public void Sync()
        {
            if (panel != null) Destroy(panel.gameObject);
            panel = null;
            deal.Sync();
            var st = store();
            var s = st?.S;
            var chair = Chair == null ? null : s?.Chairs.Find(c => c.Id == Chair);
            if (chair == null)
            {
                Chair = null;
                return;
            }
            var me = st.Me.Key;
            var sitter = chair.Owner == null ? null : s.People.Find(p => p.Key == chair.Owner);
            var p = new Panel(transform, "chair " + chair.Id, 340);
            var who = chair.Croupier ? sitter?.Name ?? "Крупье" : sitter?.Name ?? "Пустой стул";
            p.Head($"{who} · {chair.Hand.Count}", () => Show(null));

            if (chair.Owner == null && !chair.Croupier)
                p.Chip("Сесть", () =>
                {
                    st.Act(Intents.Sit(chair.Id));
                    Show(null);
                }, true);

            // Флаги: свой стул — хозяин, чужой — по праву.
            var mine = chair.Owner == me;
            var mayFlag = mine || st.May("hand.flags");
            if (!chair.Croupier || mayFlag)
            {
                p.Part("ФЛАГИ");
                foreach (var (flag, name) in Flags)
                {
                    var on = flag switch { "lock" => chair.Lock, "hide" => chair.Hide, "reject" => chair.Reject, _ => chair.Forever };
                    p.Chip(name, () => st.Act(Intents.Flag(chair.Id, flag, !on)), on, mayFlag);
                }
            }
            if (st.May("hand.pose") && !mine && chair.Hand.Count > 0)
            {
                p.Part("ПОЗА РУКИ");
                foreach (var (key, name) in Folds)
                {
                    var on = key switch { "fan" => chair.Pose.Fan, "shrink" => chair.Pose.Shrink, _ => chair.Pose.Tuck };
                    p.Chip(name, () => st.Act(key switch
                    {
                        "fan" => Intents.Pose(chair.Id, fan: !on),
                        "shrink" => Intents.Pose(chair.Id, shrink: !on),
                        _ => Intents.Pose(chair.Id, tuck: !on),
                    }), on);
                }
            }
            if (mine && !chair.Croupier) p.Chip("Встать", () =>
            {
                st.Act(Intents.Stand());
                Show(null);
            });

            // Машина на стуле и пустой стул — дела распорядителя.
            if (st.May("table.seats") && !chair.Croupier)
            {
                if (sitter?.Brain != null)
                {
                    p.Part("МАШИНА · " + sitter.Brain);
                    p.Chip("Походи", () => st.Act(Intents.Bot(chair.Id, "nudge")));
                    p.Chip("Оборвать мысль", () => st.Act(Intents.Bot(chair.Id, "cancel")));
                    p.Chip("Увести", () => st.Act(Intents.Bot(chair.Id, "kick")));
                }
                else if (chair.Owner == null)
                {
                    p.Part("ПОСАДИТЬ МАШИНУ");
                    foreach (var brain in Brains) p.Chip(brain, () => st.Act(Intents.Bot(chair.Id, "seat", brain)));
                    p.Part("");
                    var cards = chair.Hand.Count;
                    p.Chip(cards > 0 ? $"Убрать стул ({cards} карт — крупье)" : "Убрать стул", () =>
                    {
                        st.Act(Intents.Chair("drop", chair.Id));
                        Show(null);
                    }, true);
                }
            }

            if (chair.Croupier)
            {
                var admin = st.May("table.croupier");
                var acts = st.Crew.Where(a => !a.AdminOnly || admin).Select(a => (a.Part, a.Name, (Action)(() => st.Act(Intents.Crew(a.Id))))).ToList();
                if (admin)
                {
                    acts.Add(("колода", "Раздать", () => deal.Open()));
                    acts.Add(("колода", "Перемешать", () => st.Command(new Dictionary<string, object> { ["t"] = "shuffle" })));
                    acts.Add(("стол", "Ещё стул", () => st.Act(Intents.Chair("add"))));
                    acts.Add(("рука", "Перевернуть руку", () => st.Act(Intents.FlipChair(chair.Id))));
                }
                foreach (var part in Parts)
                {
                    var here = acts.Where(a => a.Item1 == part).ToList();
                    if (here.Count == 0) continue;
                    p.Part(part.ToUpperInvariant());
                    foreach (var (_, name, act) in here) p.Chip(name, act, true, true, 11);
                }
            }
            panel = p.Done(70);
        }
    }

    /** ОКНО РАЗДАЧИ — пресет, сколько, куда, кому, кому первым (`dealHtml` у веба). Раздаёт крупье. */
    public sealed class DealWindow : MonoBehaviour
    {
        public static readonly Dictionary<string, (string name, bool askable, int seats)> Presets = new()
        {
            ["each"] = ("По N", true, 0),
            ["durak"] = ("Дурак", true, 0),
            ["krest"] = ("Крестовый", false, 0),
            ["belka"] = ("Белка", false, 4),
        };

        Func<Store> store;
        RectTransform panel;
        bool open, all;
        string rule, from, dir = "cw";
        int n = 6;
        List<string> seats = new();

        public static DealWindow Make(Hud hud, Func<Store> store)
        {
            var w = new GameObject("deal window", typeof(RectTransform)).AddComponent<DealWindow>();
            w.transform.SetParent(hud.transform, false);
            Ui.Fill((RectTransform)w.transform);
            w.store = store;
            return w;
        }

        public void Open()
        {
            var st = store();
            if (st == null) return;
            open = true;
            rule = st.Deals.FirstOrDefault() ?? "each";
            n = 6;
            all = false;
            dir = "cw";
            seats = Players(st.S, dir).Select(x => x.chair).ToList();
            from = null;
            Sync();
        }

        /** Кому можно раздать — сидящие за игровыми стульями, по часовой от крупье, как обходит сервер. */
        static List<(string chair, string name)> Players(Snapshot s, string dir)
        {
            var start = s.Chairs.Find(c => c.Croupier)?.Angle ?? 0;
            double Step(Chair c) => dir == "cw" ? (start - c.Angle + 360) % 360 : (c.Angle - start + 360) % 360;
            return s.Chairs.OrderBy(Step)
                .Where(c => !c.Croupier && c.Owner != null)
                .Select(c => (c.Id, s.People.Find(p => p.Key == c.Owner)?.Name ?? "?"))
                .ToList();
        }

        public void Sync()
        {
            if (panel != null) Destroy(panel.gameObject);
            panel = null;
            var st = store();
            if (!open || st?.S == null) return;
            var players = Players(st.S, dir);
            if (from != null && !seats.Contains(from)) from = null;
            from ??= players.FirstOrDefault(x => seats.Contains(x.chair)).chair;
            var preset = Presets.TryGetValue(rule, out var pr) ? pr : Presets["each"];
            var exact = preset.seats == 0 || seats.Count == preset.seats;

            var p = new Panel(transform, "deal", 340);
            p.Head("Раздача", () =>
            {
                open = false;
                Sync();
            }, 15);
            p.Part("ПО ПРЕСЕТУ");
            foreach (var r in st.Deals.Where(Presets.ContainsKey)) p.Chip(Presets[r].name, () => Set(() => rule = r), rule == r, true, 12);
            if (preset.askable)
            {
                p.Part("СКОЛЬКО КАРТ");
                foreach (var k in new[] { 1, 2, 3, 5, 6, 8, 10 }) p.Chip(k.ToString(), () => Set(() => { n = k; all = false; }), !all && n == k, true, 12);
                p.Chip("Все по одной", () => Set(() => all = !all), all, true, 12);
            }
            p.Part("КУДА");
            p.Chip("По часовой", () => Set(() => dir = "cw"), dir == "cw", true, 12);
            p.Chip("Против часовой", () => Set(() => dir = "ccw"), dir == "ccw", true, 12);
            p.Part("КОМУ");
            if (players.Count == 0) p.Note("За столом никого");
            foreach (var (chair, name) in players) p.Chip(name, () => Set(() => { if (!seats.Remove(chair)) seats.Add(chair); }), seats.Contains(chair), true, 12);
            p.Part("КОМУ ПЕРВЫМ");
            foreach (var (chair, name) in players.Where(x => seats.Contains(x.chair))) p.Chip(name, () => Set(() => from = chair), from == chair, true, 12);
            if (!exact) p.Note($"Нужно ровно {preset.seats} игрока — выбрано {seats.Count}", Look.Gold);
            p.Wide("Раздать", () =>
            {
                var command = new Dictionary<string, object> { ["t"] = "deal", ["rule"] = rule, ["seats"] = Wire.Tree.Box(seats), ["dir"] = dir, ["force"] = true };
                if (preset.askable) command["n"] = all ? 1 : n;
                if (from != null) command["from"] = from;
                st.Command(command);
                open = false;
                Sync();
            }, exact);
            p.Note("Раздаёт крупье: его курсор и его метки. Себе не раздаёт.");
            panel = p.Done(120);
        }

        void Set(Action change)
        {
            change();
            Sync();
        }
    }
}
