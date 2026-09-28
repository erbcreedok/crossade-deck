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
