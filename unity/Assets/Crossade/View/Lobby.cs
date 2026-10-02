// МОИ КОМНАТЫ — то, что видно с иконки: кто я, мои столы, новый стол. Без ключа — вход гостем
// (или через Telegram, когда есть окно входа). Тот же список, что у Mini App и у Swift-приложения
// (`/table/my`): столы человека одни на все его клиенты.

using System;
using System.Collections.Generic;
using Crossade.Net;
using UnityEngine;
using UnityEngine.UI;

namespace Crossade.View
{
    public sealed class Lobby : MonoBehaviour
    {
        /** Сесть за стол: хост и комната. */
        public Action<string, string> Sit;

        Canvas canvas;
        RectTransform page;
        Text status;
        string host;
        bool busy;

        public static Lobby Make()
        {
            var lobby = new GameObject("Lobby").AddComponent<Lobby>();
            lobby.canvas = Ui.Overlay("Lobby Canvas", 20);
            lobby.canvas.transform.SetParent(lobby.transform, false);
            var back = Ui.Fill(Ui.Box(lobby.canvas.transform, "back", Look.FeltDark, false));
            back.GetComponent<Image>().raycastTarget = true;
            lobby.page = Ui.Fill(new GameObject("page", typeof(RectTransform)).GetComponent<RectTransform>());
            lobby.page.SetParent(lobby.canvas.transform, false);
            Ui.Fill(lobby.page);
            return lobby;
        }

        public void Show(bool on)
        {
            gameObject.SetActive(on);
            if (on) Refresh();
        }

        void Clear()
        {
            for (int i = page.childCount - 1; i >= 0; i--) Destroy(page.GetChild(i).gameObject);
        }

        void Header(string who)
        {
            var title = Ui.Words(page, "CROSSADE", 64, Look.Gold);
            Ui.Row((RectTransform)title.transform, 120, 90);
            if (who != null)
            {
                var me = Ui.Words(page, who, 30, Look.InkDim);
                Ui.Row((RectTransform)me.transform, 214, 44);
            }
            status = Ui.Words(page, "", 28, Look.InkDim);
            Ui.Row((RectTransform)status.transform, 1688 - 220, 60);
        }

        public async void Refresh()
        {
            if (busy) return;
            busy = true;
            Clear();
            Header(Account.Key != null ? Account.Name : null);
            status.text = "Ищем стол…";
            try
            {
                host ??= await Account.Host();
                if (Account.Key == null)
                {
                    Door();
                    return;
                }
                List<RoomCard> rooms;
                try
                {
                    rooms = await Account.Rooms(host);
                }
                catch (Exception e) when (e.Message.Contains("401"))
                {
                    // Адрес стола мог смениться (туннель, другой стол): спрашиваем реле заново и пробуем ещё раз, а ключ не трогаем.
                    host = await Account.Host();
                    rooms = await Account.Rooms(host);
                }
                Rooms(rooms);
            }
            catch (Exception e)
            {
                host = null;
                if (status != null) status.text = e.Message.Contains("401") ? "Стол не узнал ключ — нажми «Играть гостем» или войди заново" : e.Message;
                // Ключ не стираем: ошибка связи или чужой стол не повод разлогинивать; новый вход заменит его сам.
                if (e.Message.Contains("401")) Door();
            }
            finally
            {
                busy = false;
            }
        }

        void Door()
        {
            status.text = "";
            var guest = Ui.Button(page, "Играть гостем", async () =>
            {
                status.text = "Входим…";
                try
                {
                    await Account.Guest(host);
                    Refresh();
                }
                catch (Exception e)
                {
                    status.text = e.Message;
                }
            }, Look.Gold, Look.Black, 38);
            Ui.Row((RectTransform)guest.transform, 420, 110);
            if (!Account.CanTelegram) return;
            var tg = Ui.Button(page, "Войти через Telegram", () =>
            {
                status.text = "Ждём Telegram…";
                Account.Telegram();
            }, Look.Hex("#2aabee"), Look.Ink, 36);
            Ui.Row((RectTransform)tg.transform, 560, 110);
        }

        void Rooms(List<RoomCard> rooms)
        {
            status.text = rooms.Count == 0 ? "Столов пока нет" : "";
            float y = 300;
            var fresh = Ui.Button(page, "Новый стол", async () =>
            {
                status.text = "Ставим стол…";
                try
                {
                    var room = await Account.NewRoom(host);
                    Sit?.Invoke(host, room);
                }
                catch (Exception e)
                {
                    status.text = e.Message;
                }
            }, Look.Gold, Look.Black, 36);
            Ui.Row((RectTransform)fresh.transform, y, 100);
            y += 140;
            foreach (var r in rooms)
            {
                if (y > 1688 - 320) break;
                var who = r.Now.Count > 0 ? "  · " + string.Join(", ", r.Now) : "";
                var label = (r.Closed ? "закрыт · " : "") + r.Title + who;
                var room = r.Room;
                var b = Ui.Button(page, label, () =>
                {
                    if (!r.Closed) Sit?.Invoke(host, room);
                }, r.Closed ? Look.Well : Look.Panel, r.Closed ? Look.InkDim : Look.Ink, 30);
                Ui.Row((RectTransform)b.transform, y, 96);
                y += 112;
            }
        }
    }
}
