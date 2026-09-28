// ПРОТОКОЛ СОВПАДАЕТ С СЕРВЕРОМ — эталон пишет `server/src/table/wireFixture.test.ts`.
//
// Для каждого зрителя: начальный снимок + все патчи, сложенные C#-кодом, == конечный снимок сервера.
// И каждый снимок, прочитанный в типы и записанный обратно, == он же: поле, которого C# не знает, тут
// пропадёт и тест упадёт.

using System.IO;
using Crossade.Table;
using Crossade.Wire;
using NUnit.Framework;

public class WireTests
{
    static object Fixture() => Json.Parse(File.ReadAllText("Assets/Tests/Editor/Fixtures/wire.json"));

    [Test]
    public void ProtocolNumberMatchesServer()
    {
        Assert.AreEqual(Protocol.Number, Fixture().Int("protocol"), "сервер поднял PROTOCOL — клиент надо догнать");
    }

    [Test]
    public void WordsMatchServer()
    {
        var words = Fixture().Get("words");
        foreach (var kv in words.Obj("says")) Assert.AreEqual(kv.Value as string, Says.Refusal(kv.Key), "отказ " + kv.Key);
        Assert.AreEqual(words.Obj("says").Count, Says.Refusals.Count + 3, "отказы: у сервера есть причины, которых нет у Unity (три технические — без слов)");
        foreach (var kv in words.Obj("deals"))
        {
            Assert.IsTrue(Crossade.View.DealWindow.Presets.TryGetValue(kv.Key, out var mine), "раздача " + kv.Key);
            Assert.AreEqual(kv.Value.Str("name"), mine.name, "имя раздачи " + kv.Key);
            Assert.AreEqual(kv.Value.Flag("askable"), mine.askable, "askable " + kv.Key);
            Assert.AreEqual(kv.Value.Int("seats"), mine.seats, "seats " + kv.Key);
        }
        Assert.AreEqual(words.Obj("deals").Count, Crossade.View.DealWindow.Presets.Count);
        CollectionAssert.AreEqual(words.Strs("brains"), Crossade.View.ChairWindow.Brains, "мозги машин");
    }

    [Test]
    public void SnapshotsRoundTrip()
    {
        int n = 0;
        foreach (var kv in Fixture().Obj("reels"))
            foreach (var reel in (System.Collections.Generic.List<object>)kv.Value)
                foreach (var key in new[] { "start", "end" })
                {
                    var raw = reel.Get(key);
                    Assert.AreEqual(Json.Canon(raw), Json.Canon(Snapshot.Read(raw).Write()), $"{kv.Key}/{reel.Str("viewer")}/{key}");
                    n++;
                }
        Assert.Greater(n, 3);
    }

    [Test]
    public void PatchesFoldToServerSnapshot()
    {
        int patches = 0;
        foreach (var kv in Fixture().Obj("reels"))
            foreach (var reel in (System.Collections.Generic.List<object>)kv.Value)
            {
                var s = Snapshot.Read(reel.Get("start"));
                foreach (var raw in reel.Arr("patches"))
                {
                    var p = Patch.Read(raw);
                    Assert.IsFalse(Patching.NeedsSync(s, p), $"{kv.Key}/{reel.Str("viewer")}: v{s.V} → v{p.V}");
                    Patching.Apply(s, p);
                    patches++;
                }
                Assert.AreEqual(Json.Canon(reel.Get("end")), Json.Canon(s.Write()), $"{kv.Key}/{reel.Str("viewer")}");
            }
        Assert.Greater(patches, 20);
    }
}
