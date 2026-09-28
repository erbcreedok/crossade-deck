// СТОЛ У КЛИЕНТА — снимок, который держит экран, и всё, что его меняет: приветствие, патчи, пульс.
//
// Правду знает сервер; здесь её копия глазами одного человека (`Snapshot`). Патч не следующей версии
// или пульс с версией новее своей — копия отстала, и стол просится целиком (`sync`): угадывать, что
// потерялось, клиент не берётся (так же делает веб, `netStore.ts`).

using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Crossade.Net;
using Crossade.Wire;

namespace Crossade.Table
{
    /** Чужой палец в воздухе: что несёт и над чем сейчас (`Carry`). */
    public sealed class Carry
    {
        public string By;
        public Card Card;
        public Where From, Over;
        public bool Auto;

        public static Carry Read(object t) => new()
        {
            By = t.Str("by"), Card = Card.Read(t.Get("card")), From = Where.Read(t.Get("from")), Over = Where.Read(t.Get("over")), Auto = t.Flag("auto"),
        };
    }

    public sealed class Store
    {
        public Snapshot S { get; private set; }
        public Person Me { get; private set; }
        public string Title { get; private set; }
        /** Род стола (`Welcome.desk`). */
        public string Desk { get; private set; }
        /** Чужие пальцы в воздухе по id карты. */
        public readonly Dictionary<string, Carry> Carries = new();

        /** Стол изменился — перерисовать. */
        public event Action Changed;
        /** Стол не дал: вид намерения и причина словами (пусто — техническая, человеку не говорится). */
        public event Action<string, string> Refused;
        /** Связь кончилась: причина словами. */
        public event Action<string> Closed;

        Link link;
        bool syncing;

        public static async Task<Store> Open(string host, Dictionary<string, object> join)
        {
            join["protocol"] = Protocol.Number;
            join.TryAdd("client", "unity");
            var store = new Store();
            var ready = new TaskCompletionSource<Store>();
            store.link = await Link.Join(host, join);
            store.link.Closed += why =>
            {
                ready.TrySetException(new Exception(why));
                store.Closed?.Invoke(why);
            };
            store.link.Message += (type, body) =>
            {
                store.Heard(type, body);
                if (type == Msg.Welcome) ready.TrySetResult(store);
            };
            store.link.Send(Msg.Hello);
            return await ready.Task;
        }

        public Chair MyChair => S?.Chairs.Find(c => c.Owner == Me?.Key);

        public string NameOf(string key) => S?.People.Find(p => p.Key == key)?.Name;

        public void Act(Dictionary<string, object> intent) => link?.Send(Msg.Intent, intent);

        /** Палец несёт карту над этим местом (`CarryOut`). */
        public void CarryOut(string id, Where over) => link?.Send(Msg.Carry, new Dictionary<string, object> { ["id"] = id, ["over"] = over.Write() });

        public void Leave() => link?.Leave();

        void Heard(string type, object body)
        {
            switch (type)
            {
                case Msg.Welcome:
                    Me = Person.Read(body.Get("you"));
                    S = Snapshot.Read(body.Get("snapshot"));
                    Title = body.Str("title");
                    Desk = body.Str("desk");
                    Carries.Clear();
                    foreach (var c in body.Arr("carries")) Hold(Carry.Read(c));
                    syncing = false;
                    Changed?.Invoke();
                    return;
                case Msg.Patch:
                {
                    if (S == null) return;
                    var patch = Patch.Read(body);
                    if (patch.V <= S.V) return;
                    if (Patching.NeedsSync(S, patch))
                    {
                        Sync();
                        return;
                    }
                    Patching.Apply(S, patch);
                    // Карта, которая легла, из воздуха ушла: её несли, и теперь она на месте.
                    foreach (var op in patch.Ops)
                        if (op.T == "move" && op.Card != null) Carries.Remove(op.Card.Id);
                    Changed?.Invoke();
                    return;
                }
                case Msg.Pulse:
                    if (S != null && body.Int("v") > S.V) Sync();
                    return;
                case Msg.Refused:
                {
                    var why = body.Str("why") ?? "";
                    Refused?.Invoke(body.Obj("intent").Str("t"), Says.Refusal(why));
                    return;
                }
                case Msg.Carry:
                    Hold(Carry.Read(body));
                    Changed?.Invoke();
                    return;
            }
        }

        void Hold(Carry c)
        {
            if (c.Card?.Id == null) return;
            if (c.By == Me?.Key && !c.Auto) return;
            Carries[c.Card.Id] = c;
        }

        void Sync()
        {
            if (syncing) return;
            syncing = true;
            Act(Intents.Sync());
        }
    }
}
