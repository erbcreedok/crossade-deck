// РУКА КАК У ВЕБА — эталон пишет `server/table-client/handFixture.test.ts`: размер стекла × поза × число
// карт → где стоит каждая карта; поза под пальцем; ближайшая ступень.

using System.IO;
using Crossade.Table;
using Crossade.Wire;
using NUnit.Framework;

public class HandGeomTests
{
    static object Fixture() => Json.Parse(File.ReadAllText("Assets/Tests/Editor/Fixtures/hand.json"));
    static HandPose Pose(object t) => new() { Fan = t.Flag("fan"), Shrink = t.Flag("shrink"), Tuck = t.Flag("tuck") };
    static PoseBlend Blend(object t) => new() { Wide = t.Num("wide"), Lift = t.Num("lift") };
    const double EPS = 1e-4;

    static void Same(System.Collections.Generic.List<object> want, Slot[] got, string what)
    {
        Assert.AreEqual(want.Count, got.Length, what + " — число мест");
        for (int i = 0; i < got.Length; i++)
        {
            Assert.AreEqual(want[i].Num("x"), got[i].X, EPS, $"{what} [{i}].x");
            Assert.AreEqual(want[i].Num("y"), got[i].Y, EPS, $"{what} [{i}].y");
            Assert.AreEqual(want[i].Num("angle"), got[i].Angle, EPS, $"{what} [{i}].angle");
        }
    }

    [Test]
    public void SlotsMatchTheWeb()
    {
        int n = 0;
        foreach (var c in Fixture().Arr("cases"))
        {
            var g = c.Get("g");
            var what = $"{g.Num("w")}×{g.Num("h")} {Json.Write(c.Get("pose"))} n={c.Int("n")}";
            var got = HandGeom.Mine(g.Num("w"), g.Num("h"), Pose(c.Get("pose")), c.Int("n"));
            var box = HandGeom.Box(g.Num("w"), g.Num("h"), Pose(c.Get("pose")), c.Int("n"));
            Assert.AreEqual(c.Num("u"), box.U, EPS, what + " единица");
            Assert.AreEqual(c.Num("w"), got.W, EPS, what + " w");
            Assert.AreEqual(c.Num("h"), got.H, EPS, what + " h");
            Assert.AreEqual(c.Num("barTop"), got.BarTop, EPS, what + " barTop");
            Assert.AreEqual(c.Num("shown"), box.Shown, EPS, what + " shown");
            Same(c.Arr("slots"), got.Slots, what);
            n++;
        }
        Assert.Greater(n, 50);
    }

    [Test]
    public void BlendsMatchTheWeb()
    {
        foreach (var c in Fixture().Arr("blends"))
        {
            var got = HandGeom.Mine(390, 844, new HandPose { Fan = true }, c.Int("n"), Blend(c.Get("b")));
            Same(c.Arr("slots"), got.Slots, $"{Json.Write(c.Get("b"))} n={c.Int("n")}");
        }
    }

    [Test]
    public void SnapsMatchTheWeb()
    {
        foreach (var c in Fixture().Arr("snaps"))
        {
            var pose = Pose(c.Get("pose"));
            if (c.Get("blend") is { } b)
            {
                var got = HandGeom.BlendOf(pose);
                Assert.AreEqual(b.Num("wide"), got.Wide, EPS);
                Assert.AreEqual(b.Num("lift"), got.Lift, EPS);
                continue;
            }
            var snap = HandGeom.Snap(Blend(c.Get("b")), pose);
            var want = c.Get("snap");
            Assert.AreEqual(want.Flag("fan"), snap.Fan, "fan " + Json.Write(c));
            Assert.AreEqual(want.Flag("shrink"), snap.Shrink, "shrink " + Json.Write(c));
            Assert.AreEqual(want.Flag("tuck"), snap.Tuck, "tuck " + Json.Write(c));
        }
    }
}
