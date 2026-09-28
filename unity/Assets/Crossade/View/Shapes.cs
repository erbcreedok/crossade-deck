// ФОРМЫ — круглое, которое у встроенных примитивов Unity гранёное: сукно (плоский круг) и борт
// (тор). Сетки строятся один раз.

using System.Collections.Generic;
using UnityEngine;

namespace Crossade.View
{
    public static class Shapes
    {
        const int ROUND = 160;

        /** Круг радиуса 1 в плоскости XZ, лицом вверх. */
        public static Mesh Disc()
        {
            var v = new List<Vector3> { Vector3.zero };
            var uv = new List<Vector2> { new(.5f, .5f) };
            var t = new List<int>();
            for (int i = 0; i <= ROUND; i++)
            {
                var a = i * Mathf.PI * 2 / ROUND;
                v.Add(new Vector3(Mathf.Sin(a), 0, Mathf.Cos(a)));
                uv.Add(new Vector2(.5f + Mathf.Sin(a) / 2, .5f + Mathf.Cos(a) / 2));
                if (i > 0) t.AddRange(new[] { 0, i, i + 1 });
            }
            var m = new Mesh { name = "disc" };
            m.SetVertices(v);
            m.SetUVs(0, uv);
            m.SetTriangles(t, 0);
            m.RecalculateNormals();
            m.RecalculateBounds();
            return m;
        }

        /** Тор: `big` — радиус до середины трубки, `small` — радиус трубки; в плоскости XZ. */
        public static Mesh Torus(float big, float small, int tube = 16)
        {
            var v = new List<Vector3>();
            var n = new List<Vector3>();
            var t = new List<int>();
            for (int i = 0; i <= ROUND; i++)
            {
                var a = i * Mathf.PI * 2 / ROUND;
                var dir = new Vector3(Mathf.Sin(a), 0, Mathf.Cos(a));
                for (int j = 0; j <= tube; j++)
                {
                    var b = j * Mathf.PI * 2 / tube;
                    var normal = dir * Mathf.Cos(b) + Vector3.up * Mathf.Sin(b);
                    v.Add(dir * big + normal * small);
                    n.Add(normal);
                    if (i < ROUND && j < tube)
                    {
                        int k = i * (tube + 1) + j, next = k + tube + 1;
                        t.AddRange(new[] { k, k + 1, next, k + 1, next + 1, next });
                    }
                }
            }
            var m = new Mesh { name = "torus" };
            m.SetVertices(v);
            m.SetNormals(n);
            m.SetTriangles(t, 0);
            m.RecalculateBounds();
            return m;
        }
    }
}
