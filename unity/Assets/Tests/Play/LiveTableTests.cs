// ЖИВОЙ СТОЛ — Unity садится за настоящий (пробный) стол и играет пальцем, а второй клиент смотрит на
// тот же стол с сервера и подтверждает, что ход случился. Кадры экрана пишутся в PNG.
//
// Нужен сервер стола с гостями (`table-probe` в `.claude/launch.json`) и подписанная комната:
//   CROSSADE_HOST=http://localhost:2611 CROSSADE_ROOM=… CROSSADE_NAME=Unity CROSSADE_SHOTS=/папка \
//   Unity -batchmode -projectPath unity -runTests -testPlatform PlayMode -testResults out.xml
// Без `CROSSADE_HOST` тест пропускается.

using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Crossade;
using Crossade.Table;
using Crossade.View;
using Crossade.Wire;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.UI;

public class LiveTableTests
{
    const int W = 780, H = 1688;
    static string Env(string k) => Environment.GetEnvironmentVariable(k);

    App app;
    Store watch;
    RenderTexture rt;

    IEnumerator Until(Func<bool> ok, float seconds, string what)
    {
        var end = Time.realtimeSinceStartup + seconds;
        while (!ok())
        {
            if (Time.realtimeSinceStartup > end) Assert.Fail("не дождались: " + what);
            yield return null;
        }
    }

    IEnumerator Settle(float seconds = .8f)
    {
        var end = Time.realtimeSinceStartup + seconds;
        while (Time.realtimeSinceStartup < end) yield return null;
    }

    void Shoot(string name)
    {
        var dir = Env("CROSSADE_SHOTS");
        if (string.IsNullOrEmpty(dir)) return;
        var cam = app.Rig.Cam;
        Debug.Log($"SHOT {name} aspect={cam.aspect} px={cam.pixelWidth}x{cam.pixelHeight} pos={cam.transform.position} fov={cam.fieldOfView}");
        RenderTexture.active = rt;
        cam.Render();
        var tex = new Texture2D(W, H, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, W, H), 0, 0);
        RenderTexture.active = null;
        Directory.CreateDirectory(dir);
        File.WriteAllBytes(Path.Combine(dir, name + ".png"), tex.EncodeToPNG());
    }

    Vector2 OnScreen(CardNode node) => app.Rig.Cam.WorldToScreenPoint(node.transform.position);

    IEnumerator Drag(Vector2 a, Vector2 b)
    {
        var f = app.Finger;
        f.Down(1, a, Time.realtimeSinceStartup);
        yield return null;
        for (int i = 1; i <= 12; i++)
        {
            f.Move(1, Vector2.Lerp(a, b, i / 12f), Time.realtimeSinceStartup);
            yield return null;
        }
        f.Up(1, b, Time.realtimeSinceStartup);
        yield return null;
    }

    IEnumerator Tap(Vector2 at)
    {
        app.Finger.Down(1, at, Time.realtimeSinceStartup);
        yield return null;
        app.Finger.Up(1, at, Time.realtimeSinceStartup);
        yield return null;
    }

    [UnityTest]
    public IEnumerator SitsAtTheTableAndPlays()
    {
        var host = Env("CROSSADE_HOST");
        if (string.IsNullOrEmpty(host)) Assert.Ignore("нет CROSSADE_HOST — живой стол не задан");
        yield return Until(() => (app = UnityEngine.Object.FindAnyObjectByType<App>()) != null, 5, "приложение");
        // Другая проверка могла увести приложение из-за стола — садимся за стол из окружения заново.
        if (app.Store == null || app.Store.S == null || app.Store.Me.Name != Env("CROSSADE_NAME")) app.Open(App.Read());
        yield return Until(() => app.Store?.S != null || app.Failed != null, 20, "вход за стол");
        Assert.IsNull(app.Failed, "вход: " + app.Failed);
        rt = new RenderTexture(W, H, 24);
        app.Rig.Cam.targetTexture = rt;

        var join = new Dictionary<string, object> { ["room"] = Env("CROSSADE_ROOM"), ["door"] = "guest", ["name"] = "Watcher" };
        var opening = Store.Open(host, join);
        yield return Until(() => opening.IsCompleted, 20, "второй клиент");
        Assert.IsTrue(opening.Status == TaskStatus.RanToCompletion, "второй клиент: " + opening.Exception?.GetBaseException().Message);
        watch = opening.Result;
        yield return Settle(1.2f);
        var me = app.Store.Me.Key;
        var myChair = app.Store.MyChair;
        Assert.IsNotNull(myChair, "Unity сидит на стуле");
        Shoot("1-joined");

        // С колоды — в руку: зажал верхнюю карту и увёл к низу экрана.
        var deck = app.Store.S.Piles.First(p => p.Id == "deck");
        var top = deck.Cards[^1].Id;
        yield return Drag(OnScreen(app.Board.Node(top)), new Vector2(W / 2f, app.Board.Hand.BarPx + 120));
        Chair Mine(Store s) => s.S.Chairs.First(c => c.Id == myChair.Id);
        yield return Until(() => Mine(watch).Hand.Any(c => c.Id == top), 5, "карта в руке у Unity — глазами второго клиента");
        yield return Settle();
        Shoot("2-hand");

        // Из руки — на середину сукна.
        var slot = app.Board.Hand.Slots[0].center;
        var middle = (Vector2)app.Rig.Cam.WorldToScreenPoint(app.Board.Table.TransformPoint(Board.At(0, 0)));
        yield return Drag(slot, middle);
        yield return Until(() => watch.S.Felt.Any(c => c.Id == top), 5, "карта на сукне — глазами второго клиента");
        var laid = watch.S.Felt.First(c => c.Id == top);
        Assert.Less(Math.Abs(laid.X) + Math.Abs(laid.Y), 1.2, "легла туда, где отпустил палец");
        Assert.IsTrue(laid.Up == true, "из руки — лицом вверх");
        Assert.AreEqual(me, watch.S.Trails[top].By, "след: двигал Unity");
        yield return Settle();
        Shoot("3-felt");

        // Двойной тап — перевернуть.
        var at = OnScreen(app.Board.Node(top));
        yield return Tap(at);
        yield return Tap(at);
        yield return Until(() => watch.S.Felt.First(c => c.Id == top).Up == false, 5, "карта перевёрнута");
        yield return Settle();
        Shoot("4-turned");
    }

    Button Find(string text) =>
        UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None).FirstOrDefault(b => b.GetComponentInChildren<Text>()?.text == text && b.isActiveAndEnabled);

    [UnityTest]
    public IEnumerator LobbyLetsAGuestOpenATable()
    {
        var host = Env("CROSSADE_HOST");
        if (string.IsNullOrEmpty(host)) Assert.Ignore("нет CROSSADE_HOST — живой стол не задан");
        yield return Until(() => (app = UnityEngine.Object.FindAnyObjectByType<App>()) != null, 5, "приложение");
        rt ??= new RenderTexture(W, H, 24);
        app.Rig.Cam.targetTexture = rt;
        var keep = Crossade.Net.Account.Key;
        Crossade.Net.Account.Key = null;
        try
        {
            app.Home();
            yield return Until(() => Find("Играть гостем") != null, 15, "кнопка «Играть гостем»");
            yield return Settle(.3f);
            Shoot("5-door");
            Find("Играть гостем").onClick.Invoke();
            yield return Until(() => Find("Новый стол") != null, 15, "«Мои комнаты» с кнопкой «Новый стол»");
            Assert.IsNotNull(Crossade.Net.Account.Key, "ключ гостя на устройстве");
            yield return Settle(.3f);
            Shoot("6-rooms");
            Find("Новый стол").onClick.Invoke();
            yield return Until(() => app.Store?.S != null || app.Failed != null, 20, "за новым столом");
            Assert.IsNull(app.Failed, "вход: " + app.Failed);
            Assert.AreEqual("app", app.Store.Me.Door, "вошёл ключом приложения");
            Assert.IsNotNull(app.Store.MyChair, "сидит на стуле");
            yield return Settle(1);
            Shoot("7-new-table");
            // Назад — и новый стол уже в списке.
            app.Home();
            yield return Until(() => Find(app.Lobby != null ? "Новый стол" : "") != null, 15, "снова «Мои комнаты»");
            yield return Settle(1.5f);
            Shoot("8-rooms-again");
        }
        finally
        {
            Crossade.Net.Account.Key = keep;
        }
    }

    [TearDown]
    public void Leave()
    {
        watch?.Leave();
        if (app != null) app.Rig.Cam.targetTexture = null;
    }
}
