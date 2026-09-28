// JSON — столько, сколько нужно эталонам протокола и ответам HTTP стола: разбор в дерево (`Tree`) и
// запись из него. `Canon` пишет дерево одним способом — ключи по алфавиту, без `null`, числа одной
// записью, — чтобы два дерева сравнивались строкой.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace Crossade.Wire
{
    public static class Json
    {
        public static object Parse(string s)
        {
            int i = 0;
            var v = Value(s, ref i);
            Skip(s, ref i);
            if (i != s.Length) throw new FormatException($"json: лишнее с {i}");
            return v;
        }

        public static string Write(object v, bool canon = false)
        {
            var o = new StringBuilder();
            Put(o, v, canon);
            return o.ToString();
        }

        public static string Canon(object v) => Write(v, true);

        static void Put(StringBuilder o, object v, bool canon)
        {
            switch (v)
            {
                case null: o.Append("null"); return;
                case bool b: o.Append(b ? "true" : "false"); return;
                case string s: Quote(o, s); return;
                case IDictionary<string, object> m:
                {
                    o.Append('{');
                    var first = true;
                    var keys = canon ? m.Keys.OrderBy(k => k, StringComparer.Ordinal) : (IEnumerable<string>)m.Keys;
                    foreach (var k in keys)
                    {
                        var x = m[k];
                        if (canon && x == null) continue;
                        if (!first) o.Append(',');
                        first = false;
                        Quote(o, k);
                        o.Append(':');
                        Put(o, x, canon);
                    }
                    o.Append('}');
                    return;
                }
                case System.Collections.IList l:
                {
                    o.Append('[');
                    for (int k = 0; k < l.Count; k++)
                    {
                        if (k > 0) o.Append(',');
                        Put(o, l[k], canon);
                    }
                    o.Append(']');
                    return;
                }
            }
            if (Tree.AsNum(v) is double d)
            {
                o.Append(d == Math.Floor(d) && Math.Abs(d) < 1e15 ? ((long)d).ToString(CultureInfo.InvariantCulture) : Tree.Text(d));
                return;
            }
            throw new ArgumentException("json: не пишется " + v.GetType());
        }

        static void Quote(StringBuilder o, string s)
        {
            o.Append('"');
            foreach (var c in s)
            {
                switch (c)
                {
                    case '"': o.Append("\\\""); break;
                    case '\\': o.Append("\\\\"); break;
                    case '\n': o.Append("\\n"); break;
                    case '\r': o.Append("\\r"); break;
                    case '\t': o.Append("\\t"); break;
                    default:
                        if (c < 0x20) o.Append("\\u").Append(((int)c).ToString("x4"));
                        else o.Append(c);
                        break;
                }
            }
            o.Append('"');
        }

        static void Skip(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
        }

        static object Value(string s, ref int i)
        {
            Skip(s, ref i);
            if (i >= s.Length) throw new FormatException("json: конец");
            var c = s[i];
            if (c == '{')
            {
                i++;
                var m = new Dictionary<string, object>();
                Skip(s, ref i);
                if (s[i] == '}') { i++; return m; }
                while (true)
                {
                    Skip(s, ref i);
                    var k = Str(s, ref i);
                    Skip(s, ref i);
                    if (s[i++] != ':') throw new FormatException($"json: ждали : на {i}");
                    m[k] = Value(s, ref i);
                    Skip(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == '}') { i++; return m; }
                    throw new FormatException($"json: ждали , или }} на {i}");
                }
            }
            if (c == '[')
            {
                i++;
                var l = new List<object>();
                Skip(s, ref i);
                if (s[i] == ']') { i++; return l; }
                while (true)
                {
                    l.Add(Value(s, ref i));
                    Skip(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == ']') { i++; return l; }
                    throw new FormatException($"json: ждали , или ] на {i}");
                }
            }
            if (c == '"') return Str(s, ref i);
            if (s.Length - i >= 4 && string.CompareOrdinal(s, i, "true", 0, 4) == 0) { i += 4; return true; }
            if (s.Length - i >= 5 && string.CompareOrdinal(s, i, "false", 0, 5) == 0) { i += 5; return false; }
            if (s.Length - i >= 4 && string.CompareOrdinal(s, i, "null", 0, 4) == 0) { i += 4; return null; }
            int from = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            if (from == i) throw new FormatException($"json: непонятно на {i}");
            return double.Parse(s.Substring(from, i - from), NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        static string Str(string s, ref int i)
        {
            if (s[i] != '"') throw new FormatException($"json: ждали строку на {i}");
            i++;
            var o = new StringBuilder();
            while (s[i] != '"')
            {
                var c = s[i++];
                if (c != '\\') { o.Append(c); continue; }
                var e = s[i++];
                switch (e)
                {
                    case 'n': o.Append('\n'); break;
                    case 'r': o.Append('\r'); break;
                    case 't': o.Append('\t'); break;
                    case 'b': o.Append('\b'); break;
                    case 'f': o.Append('\f'); break;
                    case 'u': o.Append((char)Convert.ToInt32(s.Substring(i, 4), 16)); i += 4; break;
                    default: o.Append(e); break;
                }
            }
            i++;
            return o.ToString();
        }
    }
}
