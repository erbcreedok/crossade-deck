// MSGPACK — столько, сколько говорит стол: сервер (msgpackr) шлёт карты, числа, строки, флаги.
//
// Читается в дерево (`Tree`): словарь `Dictionary<string, object>`, список `List<object>`, `string`, `double`,
// `long`, `bool`, `null`. Расширения (msgpackr пишет так `undefined`) читаются как `null`.

using System;
using System.Collections.Generic;
using System.Text;

namespace Crossade.Wire
{
    public static class MsgPack
    {
        public static object Read(byte[] b, ref int i)
        {
            byte t = b[i++];
            if (t <= 0x7f) return (long)t;
            if (t >= 0xe0) return (long)(sbyte)t;
            if (t >= 0x80 && t <= 0x8f) return ReadMap(b, ref i, t & 0x0f);
            if (t >= 0x90 && t <= 0x9f) return ReadList(b, ref i, t & 0x0f);
            if (t >= 0xa0 && t <= 0xbf) return ReadStr(b, ref i, t & 0x1f);
            switch (t)
            {
                case 0xc0: return null;
                case 0xc2: return false;
                case 0xc3: return true;
                case 0xc4: { int n = (int)Uint(b, ref i, 1); var o = new byte[n]; Array.Copy(b, i, o, 0, n); i += n; return o; }
                case 0xc5: { int n = (int)Uint(b, ref i, 2); var o = new byte[n]; Array.Copy(b, i, o, 0, n); i += n; return o; }
                case 0xc6: { int n = (int)Uint(b, ref i, 4); var o = new byte[n]; Array.Copy(b, i, o, 0, n); i += n; return o; }
                case 0xc7: { int n = (int)Uint(b, ref i, 1); i += 1 + n; return null; }
                case 0xc8: { int n = (int)Uint(b, ref i, 2); i += 1 + n; return null; }
                case 0xc9: { int n = (int)Uint(b, ref i, 4); i += 1 + n; return null; }
                case 0xca: { var u = (uint)Uint(b, ref i, 4); return (double)BitConverter.ToSingle(BitConverter.GetBytes(u), 0); }
                case 0xcb: { var u = Uint(b, ref i, 8); return BitConverter.Int64BitsToDouble((long)u); }
                case 0xcc: return (long)Uint(b, ref i, 1);
                case 0xcd: return (long)Uint(b, ref i, 2);
                case 0xce: return (long)Uint(b, ref i, 4);
                case 0xcf: return (long)Uint(b, ref i, 8);
                case 0xd0: return (long)(sbyte)Uint(b, ref i, 1);
                case 0xd1: return (long)(short)Uint(b, ref i, 2);
                case 0xd2: return (long)(int)Uint(b, ref i, 4);
                case 0xd3: return (long)Uint(b, ref i, 8);
                case 0xd4: i += 2; return null;
                case 0xd5: i += 3; return null;
                case 0xd6: i += 5; return null;
                case 0xd7: i += 9; return null;
                case 0xd8: i += 17; return null;
                case 0xd9: return ReadStr(b, ref i, (int)Uint(b, ref i, 1));
                case 0xda: return ReadStr(b, ref i, (int)Uint(b, ref i, 2));
                case 0xdb: return ReadStr(b, ref i, (int)Uint(b, ref i, 4));
                case 0xdc: return ReadList(b, ref i, (int)Uint(b, ref i, 2));
                case 0xdd: return ReadList(b, ref i, (int)Uint(b, ref i, 4));
                case 0xde: return ReadMap(b, ref i, (int)Uint(b, ref i, 2));
                case 0xdf: return ReadMap(b, ref i, (int)Uint(b, ref i, 4));
            }
            throw new FormatException("msgpack: byte 0x" + t.ToString("x2"));
        }

        static ulong Uint(byte[] b, ref int i, int n)
        {
            ulong v = 0;
            for (int k = 0; k < n; k++) v = (v << 8) | b[i++];
            return v;
        }

        static string ReadStr(byte[] b, ref int i, int n)
        {
            var s = Encoding.UTF8.GetString(b, i, n);
            i += n;
            return s;
        }

        static List<object> ReadList(byte[] b, ref int i, int n)
        {
            var o = new List<object>(n);
            for (int k = 0; k < n; k++) o.Add(Read(b, ref i));
            return o;
        }

        static Dictionary<string, object> ReadMap(byte[] b, ref int i, int n)
        {
            var o = new Dictionary<string, object>(n);
            for (int k = 0; k < n; k++)
            {
                var key = Read(b, ref i);
                o[Convert.ToString(key, System.Globalization.CultureInfo.InvariantCulture)] = Read(b, ref i);
            }
            return o;
        }

        // ─── запись: то, что шлёт приложение — строки, числа, флаги, словари ───────────────────────────
        public static void Write(List<byte> o, object v)
        {
            switch (v)
            {
                case null: o.Add(0xc0); return;
                case bool f: o.Add(f ? (byte)0xc3 : (byte)0xc2); return;
                case string s: WriteStr(o, s); return;
                case int n: WriteInt(o, n); return;
                case long n: WriteInt(o, n); return;
                case float f: WriteDouble(o, f); return;
                case double d: WriteDouble(o, d); return;
                case IDictionary<string, object> map:
                    if (map.Count < 16) o.Add((byte)(0x80 | map.Count)); else { o.Add(0xde); o.Add((byte)(map.Count >> 8)); o.Add((byte)map.Count); }
                    foreach (var kv in map) { WriteStr(o, kv.Key); Write(o, kv.Value); }
                    return;
                case IList<object> list:
                    if (list.Count < 16) o.Add((byte)(0x90 | list.Count)); else { o.Add(0xdc); o.Add((byte)(list.Count >> 8)); o.Add((byte)list.Count); }
                    foreach (var one in list) Write(o, one);
                    return;
            }
            throw new ArgumentException("msgpack: can't write " + v.GetType());
        }

        /** Строка так, как её пишут msgpack и схема Colyseus (тип сообщения в кадре). */
        public static void WriteStr(List<byte> o, string s)
        {
            var bytes = Encoding.UTF8.GetBytes(s);
            int n = bytes.Length;
            if (n < 32) o.Add((byte)(0xa0 | n));
            else if (n < 256) { o.Add(0xd9); o.Add((byte)n); }
            else if (n < 65536) { o.Add(0xda); o.Add((byte)(n >> 8)); o.Add((byte)n); }
            else { o.Add(0xdb); o.Add((byte)(n >> 24)); o.Add((byte)(n >> 16)); o.Add((byte)(n >> 8)); o.Add((byte)n); }
            o.AddRange(bytes);
        }

        static void WriteInt(List<byte> o, long n)
        {
            if (n >= 0 && n <= 0x7f) { o.Add((byte)n); return; }
            if (n < 0 && n >= -32) { o.Add((byte)(sbyte)n); return; }
            o.Add(0xd3);
            for (int k = 7; k >= 0; k--) o.Add((byte)(n >> (8 * k)));
        }

        static void WriteDouble(List<byte> o, double d)
        {
            o.Add(0xcb);
            long bits = BitConverter.DoubleToInt64Bits(d);
            for (int k = 7; k >= 0; k--) o.Add((byte)(bits >> (8 * k)));
        }
    }
}
