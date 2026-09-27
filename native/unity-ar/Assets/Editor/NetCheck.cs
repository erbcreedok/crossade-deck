// ПРОВЕРКА СВЯЗИ СО СТОЛОМ — из консоли, без телефона: Unity входит за живой (пробный) стол тем же кодом,
// что в приложении, строит стол по снимку, снимает его в PNG и ждёт, пока стол изменится.
//
//   CROSSADE_CHECK_HOST=http://localhost:2597 CROSSADE_CHECK_ROOM=… CROSSADE_CHECK_PASS=… CROSSADE_CHECK_SHOT=/path.png \
//   Unity -batchmode -projectPath native/unity-ar -executeMethod NetCheck.Run
//
// Печатает строки `NETCHECK …` и выходит с кодом 0, если увидел и первый снимок, и изменение.

using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

public static class NetCheck
{
    static TableLink link;
    static TableView view;
    static GameObject root;
    static int welcomes;
    static double deadline, syncAt = -1;
    static string firstShape;

    public static void Run()
    {
        var env = (Func<string, string>)Environment.GetEnvironmentVariable;
        deadline = EditorApplication.timeSinceStartup + 90;
        root = new GameObject("Card Table");
        view = new TableView(root.transform, Resources.Load<Font>("Tiny5"));
        EditorApplication.update += Tick;
        Join(env("CROSSADE_CHECK_HOST"), env("CROSSADE_CHECK_ROOM"), env("CROSSADE_CHECK_PASS"), env("CROSSADE_CHECK_SHOT"));
    }

    static async void Join(string host, string room, string pass, string shot)
    {
        try
        {
            link = await TableLink.Join(host, new Dictionary<string, string> { ["room"] = room, ["client"] = "unity", ["door"] = "app", ["pass"] = pass, ["protocol"] = "2" });
        }
        catch (Exception e)
        {
            Done(1, "join failed: " + e.Message);
            return;
        }
        link.Closed += (why) => Done(1, "closed: " + why);
        link.Message += (type, body) =>
        {
            if (type == "patch" && syncAt < 0) syncAt = EditorApplication.timeSinceStartup + .25;
            if (type != "welcome") return;
            var snap = body.Obj("snapshot");
            var me = body.Obj("you").Str("key");
            view.Show(snap, me);
            var shape = Shape(snap, me);
            welcomes++;
            Debug.Log($"NETCHECK welcome {welcomes} you={me} name={body.Obj("you").Str("name")} {shape} built={root.transform.Find("Board").childCount}");
            if (welcomes == 1)
            {
                firstShape = shape;
                if (!string.IsNullOrEmpty(shot)) Shoot(shot);
                Debug.Log("NETCHECK ready");
            }
            else if (shape != firstShape) Done(0, "changed");
        };
        link.Send("hello");
    }

    static string Shape(Dictionary<string, object> snap, string me)
    {
        int felt = snap.Arr("felt").Count, piles = 0, hands = 0, mine = 0;
        foreach (var p in snap.Arr("piles")) piles += p.Arr("cards").Count;
        foreach (var c in snap.Arr("chairs")) { hands += c.Arr("hand").Count; if (c.Str("owner") == me) mine = c.Arr("hand").Count; }
        return $"felt={felt} piles={piles} hands={hands} mine={mine} chairs={snap.Arr("chairs").Count}";
    }

    static void Shoot(string path)
    {
        var cam = new GameObject("Shot").AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(.08f, .09f, .1f);
        cam.transform.position = Quaternion.Euler(55, 0, 0) * new Vector3(0, 0, -1.1f);
        cam.transform.LookAt(Vector3.zero);
        var rt = new RenderTexture(780, 1688, 24);
        cam.targetTexture = rt;
        cam.Render();
        RenderTexture.active = rt;
        var tex = new Texture2D(rt.width, rt.height, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
        File.WriteAllBytes(path, tex.EncodeToPNG());
        RenderTexture.active = null;
        Debug.Log("NETCHECK shot " + path);
    }

    static void Tick()
    {
        if (syncAt >= 0 && EditorApplication.timeSinceStartup >= syncAt)
        {
            syncAt = -1;
            link?.Send("intent", new Dictionary<string, object> { ["t"] = "sync" });
        }
        if (EditorApplication.timeSinceStartup > deadline) Done(1, "timeout after " + welcomes + " welcome(s)");
    }

    static void Done(int code, string why)
    {
        EditorApplication.update -= Tick;
        Debug.Log($"NETCHECK done {code} {why}");
        link?.Leave();
        EditorApplication.Exit(code);
    }
}
