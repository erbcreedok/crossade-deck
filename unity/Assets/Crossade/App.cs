// ВХОД — откуда приложение знает, за какой стол садиться, и сборка экрана вокруг него.
//
// Адрес стола приходит ссылкой (`crossade://table?host=…&room=…&pass=…&key=…`, её выдаёт стол в
// Telegram — `MSG.app`), аргументами запуска (`-crossade-host …`) или переменными окружения
// (`CROSSADE_HOST`, для проверок). С пропуском (`pass`) и ключом (`key`) вход — дверью `app`: тот же
// человек, что в Telegram. Без них — гостем с именем, если стол пускает гостей.

using System;
using System.Collections.Generic;
using Crossade.Net;
using Crossade.Play;
using Crossade.Table;
using Crossade.View;
using UnityEngine;

namespace Crossade
{
    public sealed class App : MonoBehaviour
    {
        public Store Store { get; private set; }
        public Board Board { get; private set; }
        public Rig Rig { get; private set; }
        public Hud Hud { get; private set; }
        public Finger Finger { get; private set; }
        public Lobby Lobby { get; private set; }
        /** Чем кончился вход: `null` — ещё идёт. */
        public string Failed { get; private set; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (FindAnyObjectByType<App>() != null) return;
            new GameObject("App").AddComponent<App>();
        }

        public sealed class Door
        {
            public string Host, Room, Pass, Key, Name;
        }

        /** Куда входить — из ссылки, аргументов или окружения; `null` — не сказано. */
        public static Door Read(string url = null)
        {
            var d = new Door();
            var q = Query(url ?? Application.absoluteURL);
            string Pick(string key) =>
                q.TryGetValue(key, out var v) ? v : Arg("-crossade-" + key) ?? Environment.GetEnvironmentVariable("CROSSADE_" + key.ToUpperInvariant());
            d.Host = Pick("host");
            d.Room = Pick("room");
            d.Pass = Pick("pass");
            d.Key = Pick("key");
            d.Name = Pick("name");
            return d.Host != null && d.Room != null ? d : null;
        }

        static string Arg(string name)
        {
            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i + 1 < args.Length; i++)
                if (args[i] == name) return args[i + 1];
            return null;
        }

        static Dictionary<string, string> Query(string url)
        {
            var o = new Dictionary<string, string>();
            if (string.IsNullOrEmpty(url)) return o;
            var q = url.IndexOf('?');
            if (q < 0) return o;
            foreach (var part in url.Substring(q + 1).Split('&'))
            {
                var eq = part.IndexOf('=');
                if (eq <= 0) continue;
                o[Uri.UnescapeDataString(part.Substring(0, eq))] = Uri.UnescapeDataString(part.Substring(eq + 1));
            }
            return o;
        }

        void Awake()
        {
            Application.targetFrameRate = 60;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;
            Rig = Rig.Make();
            Board = Board.Make();
            Board.Hand = HandRig.Make(Rig.Cam);
            Hud = Hud.Make(Rig.Cam, Board.Hand.BarPx);
            Hud.Home = Home;
            Lobby = Lobby.Make();
            Lobby.Sit = (host, room) => Open(new Door { Host = host, Room = room, Key = Account.Key });
            Application.deepLinkActivated += url =>
            {
                if (Read(url) is { } door) Open(door);
            };
            if (Read() is { } first) Open(first);
            else Home();
        }

        /** Назад к «Моим комнатам»: из-за стола встаём, стул остаётся за нами. */
        public void Home()
        {
            Store?.Leave();
            Store = null;
            Board.Clear();
            Lobby.Show(true);
        }

        public async void Open(Door door)
        {
            Lobby.Show(false);
            Store?.Leave();
            Store = null;
            Failed = null;
            Hud.Title("Входим…");
            var join = new Dictionary<string, object> { ["room"] = door.Room };
            if (door.Key != null && door.Key != Account.Key) Account.Key = door.Key;
            if (door.Pass != null || door.Key != null)
            {
                join["door"] = "app";
                if (door.Pass != null) join["pass"] = door.Pass;
                if (door.Key != null) join["key"] = door.Key;
            }
            else
            {
                join["door"] = "guest";
                join["name"] = door.Name ?? "Гость";
            }
            try
            {
                Store = await Store.Open(door.Host, join);
            }
            catch (Exception e)
            {
                Failed = e.Message;
                Hud.Title(e.Message == Wire.Protocol.RoomClosed ? "Стол закрыт" : "Не вошли");
                Hud.Say(e.Message, 6);
                return;
            }
            Store.Changed += Draw;
            Store.Refused += (_, why) => Hud.Say(why);
            Store.Closed += why =>
            {
                Hud.Say("Связь: " + why, 6);
                Failed = why;
            };
            Finger = new Finger(Store, Board, Rig);
            var pointer = gameObject.GetComponent<Pointer>() ?? gameObject.AddComponent<Pointer>();
            pointer.Finger = Finger;
            pointer.Rig = Rig;
            Draw();
        }

        void Draw()
        {
            if (Store?.S == null) return;
            Hud.Title(Store.Title);
            Board.Show(Store);
        }

        void OnDestroy() => Store?.Leave();
    }
}
