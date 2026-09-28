// КТО Я И ГДЕ СТОЛЫ — вход приложения, без Telegram Mini App (`server/src/table/routes.ts`, раздел
// «ПРИЛОЖЕНИЕ CROSSADE»):
//
//   реле     `https://crossade-deck-server.fly.dev/relay/table` говорит, где сейчас живёт мак со столами;
//   ключ     называет человека (`appPass.ts`): гостем — сразу (`/table/app/guest`), Telegram — окном входа;
//   столы    «Мои комнаты» по ключу (`/table/my`), новый стол (`/table/app/rooms`).
//
// Ключ лежит на устройстве (`PlayerPrefs`), как у Swift-приложения в `UserDefaults`.

using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Crossade.Wire;
using UnityEngine;

namespace Crossade.Net
{
    /** Стол из «Моих комнат» (`MyRoom`/`MyClosed` сервера). */
    public sealed class RoomCard
    {
        public string Room, Title, Kind, Chat;
        /** Кто за столом сейчас — имена людей. */
        public List<string> Now = new();
        public bool Closed;
    }

    public static class Account
    {
        public const string Relay = "https://crossade-deck-server.fly.dev";
        const string KEY = "crossade.key", NAME = "crossade.name";
        const string APP_KEY_HEADER = "x-crossade-app-key";

        static readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(20) };

        public static string Key
        {
            get => PlayerPrefs.GetString(KEY, null) is { Length: > 0 } k ? k : null;
            set
            {
                if (value == null) PlayerPrefs.DeleteKey(KEY);
                else PlayerPrefs.SetString(KEY, value);
                PlayerPrefs.Save();
            }
        }

        public static string Name
        {
            get => PlayerPrefs.GetString(NAME, null);
            set
            {
                PlayerPrefs.SetString(NAME, value ?? "");
                PlayerPrefs.Save();
            }
        }

        /** Где мак со столами сейчас: адрес туннеля из реле. Переменная `CROSSADE_HOST` — для проверок. */
        public static async Task<string> Host()
        {
            var fixedHost = Environment.GetEnvironmentVariable("CROSSADE_HOST");
            if (!string.IsNullOrEmpty(fixedHost)) return fixedHost;
            var answer = Json.Parse(await http.GetStringAsync(Relay + "/relay/table"));
            if (!answer.Flag("up") || answer.Str("url") == null) throw new Exception("Стол сейчас выключен");
            return answer.Str("url");
        }

        static async Task<object> Call(HttpMethod method, string url, object body = null)
        {
            var ask = new HttpRequestMessage(method, url);
            if (Key != null) ask.Headers.Add(APP_KEY_HEADER, Key);
            if (body != null) ask.Content = new StringContent(Json.Write(body), Encoding.UTF8, "application/json");
            var answer = await http.SendAsync(ask);
            var text = await answer.Content.ReadAsStringAsync();
            if (!answer.IsSuccessStatusCode) throw new Exception($"{(int)answer.StatusCode}: {text}");
            return Json.Parse(text);
        }

        /** Войти гостем: ключ на это устройство. */
        public static async Task Guest(string host)
        {
            var got = await Call(HttpMethod.Post, host + "/table/app/guest", new Dictionary<string, object>());
            Key = got.Str("key");
            Name = got.Str("name");
        }

        /** Мои столы — открытые и закрытые. */
        public static async Task<List<RoomCard>> Rooms(string host)
        {
            var got = await Call(HttpMethod.Get, host + "/table/my");
            var o = new List<RoomCard>();
            foreach (var r in got.Arr("rooms")) o.Add(Card(r, false));
            foreach (var r in got.Arr("closed")) o.Add(Card(r, true));
            return o;
        }

        static RoomCard Card(object r, bool closed) => new()
        {
            Room = r.Str("room"), Title = r.Str("title") ?? "Стол", Kind = r.Str("kind"), Chat = r.Str("chat"), Now = r.Strs("now"), Closed = closed,
        };

        /** Новый стол: хозяин — тот, кто назван ключом. */
        public static async Task<string> NewRoom(string host, string kind = null)
        {
            var body = new Dictionary<string, object>();
            if (kind != null) body["kind"] = kind;
            var got = await Call(HttpMethod.Post, host + "/table/app/rooms", body);
            return got.Str("room");
        }
    }
}
