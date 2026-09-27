// СВЯЗЬ СО СТОЛОМ — комната Colyseus 0.15 без схемы: только сообщения msgpack.
//
// Вход в два шага, как у `colyseus.js`: HTTP-запрос места (`/matchmake/joinOrCreate/table_room`), потом
// WebSocket в эту комнату с номером места. Кадр от сервера начинается кодом:
//   10  вход принят — подтверждаем тем же кодом
//   11  ошибка: номер и текст (так приходит отказ `onAuth` — «who are you», «room closed»)
//   13  сообщение: тип строкой или числом, дальше тело msgpack
// Сами шлём кадр 13: тип строкой и тело.
//
// Все события приходят в главном потоке Unity: цепочки `await` возвращаются в его контекст.

using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

public sealed class TableLink
{
    const byte JOIN_ROOM = 10, ERROR = 11, ROOM_DATA = 13;

    public event Action<string, object> Message;
    /** Связь кончилась: причина словами (отказ сервера, обрыв). */
    public event Action<string> Closed;

    readonly ClientWebSocket ws = new();
    readonly CancellationTokenSource stop = new();
    bool closed;
    string refusal;

    TableLink() { }

    /** Войти за стол: `host` — адрес мака (`https://…`), `options` — `JoinOptions` стола. */
    public static async Task<TableLink> Join(string host, Dictionary<string, string> options)
    {
        host = host.TrimEnd('/');
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        var body = new StringBuilder("{");
        foreach (var kv in options)
        {
            if (body.Length > 1) body.Append(',');
            body.Append(Quote(kv.Key)).Append(':').Append(kv.Key == "protocol" ? kv.Value : Quote(kv.Value));
        }
        body.Append('}');
        var answer = await http.PostAsync(host + "/matchmake/joinOrCreate/table_room", new StringContent(body.ToString(), Encoding.UTF8, "application/json"));
        var text = await answer.Content.ReadAsStringAsync();
        var error = Field(text, "error");
        if (error != null) throw new Exception(error);
        string roomId = Field(text, "roomId"), processId = Field(text, "processId"), sessionId = Field(text, "sessionId");
        if (roomId == null || processId == null || sessionId == null) throw new Exception("стол ответил не так: " + (text.Length > 120 ? text[..120] : text));

        var link = new TableLink();
        var ws = Regex.Replace(host, "^http", "ws");
        await link.ws.ConnectAsync(new Uri($"{ws}/{processId}/{roomId}?sessionId={Uri.EscapeDataString(sessionId)}"), link.stop.Token);
        _ = link.Pump();
        return link;
    }

    public async void Send(string type, object payload = null)
    {
        if (closed || ws.State != WebSocketState.Open) return;
        var frame = new List<byte> { ROOM_DATA };
        MsgPack.WriteStr(frame, type);
        if (payload != null) MsgPack.Write(frame, payload);
        try { await ws.SendAsync(new ArraySegment<byte>(frame.ToArray()), WebSocketMessageType.Binary, true, stop.Token); }
        catch (Exception e) { Close("не отправилось: " + e.Message); }
    }

    public void Leave()
    {
        if (closed) return;
        closed = true;
        stop.Cancel();
        try { ws.Abort(); } catch { }
    }

    async Task Pump()
    {
        var buffer = new byte[64 * 1024];
        var frame = new List<byte>();
        try
        {
            while (!closed)
            {
                var got = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), stop.Token);
                if (got.MessageType == WebSocketMessageType.Close)
                {
                    Close(refusal ?? (ws.CloseStatusDescription is { Length: > 0 } d ? d : "стол закрыл связь (" + (int?)ws.CloseStatus + ")"));
                    return;
                }
                for (int k = 0; k < got.Count; k++) frame.Add(buffer[k]);
                if (!got.EndOfMessage) continue;
                var bytes = frame.ToArray();
                frame.Clear();
                Heard(bytes);
            }
        }
        catch (Exception e)
        {
            Close(refusal ?? "связь оборвалась: " + e.Message);
        }
    }

    void Heard(byte[] b)
    {
        if (b.Length == 0) return;
        int i = 1;
        switch (b[0])
        {
            case JOIN_ROOM:
                _ = ws.SendAsync(new ArraySegment<byte>(new[] { JOIN_ROOM }), WebSocketMessageType.Binary, true, stop.Token);
                return;
            case ERROR:
                MsgPack.Read(b, ref i);
                refusal = MsgPack.Read(b, ref i) as string;
                return;
            case ROOM_DATA:
                var type = Convert.ToString(MsgPack.Read(b, ref i));
                var body = i < b.Length ? MsgPack.Read(b, ref i) : null;
                Message?.Invoke(type, body);
                return;
        }
    }

    void Close(string why)
    {
        if (closed) return;
        closed = true;
        stop.Cancel();
        Closed?.Invoke(why);
    }

    static string Quote(string s) =>
        "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r") + "\"";

    /** Строковое поле ответа места: он плоский и маленький, разбор JSON ради него не нужен. */
    public static string Field(string json, string name)
    {
        var m = Regex.Match(json, "\"" + name + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
        return m.Success ? Regex.Unescape(m.Groups[1].Value) : null;
    }
}
