// ДЕРЕВО ЗНАЧЕНИЙ — то, во что превращаются и msgpack со стола, и JSON эталонов: словарь
// `Dictionary<string, object>`, список `List<object>`, `string`, `double`/`long`, `bool`, `null`.
//
// Типы протокола (`Contract.cs`) читаются из дерева и пишутся в него же; сеть и файлы про типы не знают.

using System;
using System.Collections.Generic;
using System.Globalization;

namespace Crossade.Wire
{
    public static class Tree
    {
        public static Dictionary<string, object> Map(this object v) => v as Dictionary<string, object>;

        public static object Get(this object v, string key) =>
            v is Dictionary<string, object> m && m.TryGetValue(key, out var x) ? x : null;

        public static bool Has(this object v, string key) => v.Get(key) != null;

        public static Dictionary<string, object> Obj(this object v, string key) => v.Get(key) as Dictionary<string, object>;

        public static List<object> Arr(this object v, string key) => v.Get(key) as List<object> ?? new List<object>();

        public static string Str(this object v, string key) => v.Get(key) as string;

        public static double Num(this object v, string key, double or = 0) => AsNum(v.Get(key)) ?? or;

        public static double? NumOrNull(this object v, string key) => AsNum(v.Get(key));

        public static int Int(this object v, string key, int or = 0) => AsNum(v.Get(key)) is double d ? (int)d : or;

        public static int? IntOrNull(this object v, string key) => AsNum(v.Get(key)) is double d ? (int)d : null;

        public static bool Flag(this object v, string key) => v.Get(key) is bool b && b;

        public static bool? FlagOrNull(this object v, string key) => v.Get(key) as bool?;

        public static double? AsNum(object x) => x switch
        {
            double d => d,
            long l => l,
            int i => i,
            float f => f,
            _ => null,
        };

        public static List<string> Strs(this object v, string key)
        {
            var o = new List<string>();
            foreach (var x in v.Arr(key)) if (x is string s) o.Add(s);
            return o;
        }

        public static List<object> Box(IEnumerable<string> xs)
        {
            var o = new List<object>();
            foreach (var x in xs) o.Add(x);
            return o;
        }

        public static string Text(double d) => d.ToString("R", CultureInfo.InvariantCulture);
    }

    /** Сборка словаря для записи: `null` не пишется — у стола «нет поля» и «пусто» одно и то же. */
    public sealed class Fields
    {
        public readonly Dictionary<string, object> Map = new();

        public Fields Put(string key, object value)
        {
            if (value != null) Map[key] = value;
            return this;
        }

        /** Необязательный флаг `?: true` — пишется только поднятым. */
        public Fields Mark(string key, bool on)
        {
            if (on) Map[key] = true;
            return this;
        }

        /** Поле, которое у стола есть всегда, даже пустым (`owner: null`). */
        public Fields Always(string key, object value)
        {
            Map[key] = value;
            return this;
        }
    }
}
