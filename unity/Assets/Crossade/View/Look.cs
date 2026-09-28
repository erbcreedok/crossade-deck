// ОБЛИК — палитра (`look/src/palette.ts`), шрифт Tiny5 и растры карт. Одно место, откуда вид берёт
// цвета и материалы: второй палитры в клиенте нет.

using System.Collections.Generic;
using Crossade.Wire;
using UnityEngine;

namespace Crossade.View
{
    public static class Look
    {
        public static readonly Color Felt = Hex("#173d2d"), FeltDark = Hex("#0f2e22"), Panel = Hex("#3a2a1d"), PanelLight = Hex("#4a3627");
        public static readonly Color Well = Hex("#1c120b"), Ink = Hex("#f5ead0"), InkDim = Hex("#cdb98f"), Gold = Hex("#f2c14e");
        public static readonly Color GoldLight = Hex("#f8d885"), GoldDark = Hex("#b08a26"), Danger = Hex("#e0483f"), Black = Hex("#0b0704");
        public static readonly Color Wood = Hex("#6b4d2c"), Paper = Hex("#efe6d2"), Mint = Hex("#7fd1b9");

        public static Color Hex(string s) => ColorUtility.TryParseHtmlString(s, out var c) ? c : Color.magenta;

        static Font font;
        public static Font Font => font ??= Resources.Load<Font>("Fonts/Tiny5");

        static readonly Dictionary<string, Material> materials = new();
        static Mesh quad, cube, cylinder;
        public static Mesh Quad => quad ??= Resources.GetBuiltinResource<Mesh>("Quad.fbx");
        public static Mesh Cube => cube ??= Resources.GetBuiltinResource<Mesh>("Cube.fbx");
        public static Mesh Cylinder => cylinder ??= Resources.GetBuiltinResource<Mesh>("Cylinder.fbx");

        /** Сплошной цвет. `lit` — со светом: у объёмных вещей (борт, фишки) видны грани. */
        public static Material Solid(Color c, bool lit = false)
        {
            var key = (lit ? "lit:" : "flat:") + ColorUtility.ToHtmlStringRGBA(c);
            if (materials.TryGetValue(key, out var m)) return m;
            m = lit ? new Material(Shader.Find("Standard")) { color = c } : new Material(Shader.Find("Unlit/Color")) { color = c };
            if (lit) m.SetFloat("_Glossiness", .15f);
            return materials[key] = m;
        }

        /** Растр карты: лицо (`faces` — набор стола) или рубашка. Нет растра — рубашка plaid. */
        public static Material Art(string path)
        {
            if (materials.TryGetValue(path, out var m)) return m;
            var tex = Resources.Load<Texture2D>(path) ?? Resources.Load<Texture2D>("Cards/backs/plaid");
            m = new Material(Shader.Find("Unlit/Transparent Cutout")) { mainTexture = tex };
            m.SetFloat("_Cutoff", .5f);
            return materials[path] = m;
        }

        public static string FacePath(string faces, Face face) => face == null ? null : $"Cards/{faces}/{FaceFile(face)}";
        public static string BackPath(string back) => $"Cards/backs/{back}";

        public static string FaceFile(Face face)
        {
            if (face.Rank == "JK") return face.Suit == "b" ? "joker-black" : "joker-red";
            var word = face.Suit switch { "s" => "spade", "h" => "heart", "d" => "diamond", _ => "club" };
            return $"{word}-{face.Rank}";
        }

        /** Надпись в мире — плоская, шрифтом стола. */
        public static TextMesh Label(Transform parent, string text, Color color, float size = .09f)
        {
            var node = new GameObject("label").transform;
            node.SetParent(parent, false);
            var mesh = node.gameObject.AddComponent<TextMesh>();
            mesh.font = Font;
            mesh.fontSize = 64;
            mesh.characterSize = size / 6.4f;
            mesh.anchor = TextAnchor.MiddleCenter;
            mesh.alignment = TextAlignment.Center;
            mesh.color = color;
            mesh.text = text;
            node.GetComponent<MeshRenderer>().sharedMaterial = Font.material;
            return mesh;
        }
    }
}
