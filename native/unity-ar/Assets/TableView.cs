// СТОЛ ИЗ СНИМКА — то, что прислал сервер (`Snapshot`), в вещах Unity. Только смотреть: каждый новый
// снимок перестраивает стол целиком — карт на столе десятки, и пересобрать их дешевле, чем сверять.
//
// Оси — те же, что у сервера (`ring.ts`): единица — ширина карты (карта 1 × 1.4), середина стола — ноль,
// +y — к своей стороне (вниз экрана веба). В Unity: x → x, y → −z, стол лежит в плоскости XZ. Углы карт —
// градусы по часовой в осях стола, и в Unity это поворот вокруг Y той же величины.
//
// Размер — настоящий: единица `UNIT` метров, и карта в AR размером с карту в руке.

using System.Collections.Generic;
using UnityEngine;

public sealed class TableView
{
    /** Метров в единице стола: карта шириной 6.3 см, как настоящая; стол тогда около 81 см. */
    public const float UNIT = .063f;
    const float TABLE_RADIUS = 6.4f, SEAT_RADIUS = TABLE_RADIUS * .875f, RING_LAY = 3f - 1.4f / 2f;
    const float LAYER = .0004f, HAND_SCALE = .55f, FELT_TOP = .0f;

    readonly Transform root;
    readonly Transform board;
    readonly Font font;
    readonly Dictionary<string, Material> materials = new();
    static Mesh quad, cube, cylinder;

    /** Мой стул: его угол ставит мою сторону к зрителю (−z). */
    public float MyAngle { get; private set; }

    public TableView(Transform root, Font font)
    {
        this.root = root;
        this.font = font;
        quad ??= Resources.GetBuiltinResource<Mesh>("Quad.fbx");
        cube ??= Resources.GetBuiltinResource<Mesh>("Cube.fbx");
        cylinder ??= Resources.GetBuiltinResource<Mesh>("Cylinder.fbx");
        // Сукно — само по себе, карты — на доске, которая поворачивается к моему стулу.
        var felt = Solid("Felt", root, cylinder, new Color(.07f, .34f, .25f));
        felt.localScale = new Vector3(2 * TABLE_RADIUS * UNIT, .012f, 2 * TABLE_RADIUS * UNIT);
        felt.localPosition = new Vector3(0, -.012f, 0);
        var rim = Solid("Rim", root, cylinder, new Color(.42f, .30f, .17f));
        rim.localScale = new Vector3(2 * (TABLE_RADIUS + .6f) * UNIT, .011f, 2 * (TABLE_RADIUS + .6f) * UNIT);
        rim.localPosition = new Vector3(0, -.014f, 0);
        board = new GameObject("Board").transform;
        board.SetParent(root, false);
    }

    /** Перестроить стол по снимку, глазами `me`. */
    public void Show(Dictionary<string, object> snap, string me)
    {
        for (int k = board.childCount - 1; k >= 0; k--)
        {
            var old = board.GetChild(k).gameObject;
            if (Application.isPlaying) Object.Destroy(old); else Object.DestroyImmediate(old);
        }
        var rules = snap.Obj("rules");
        string faces = rules.Str("faces") ?? "classic", back = rules.Str("back") ?? "plaid";
        var names = new Dictionary<string, string>();
        foreach (var p in snap.Arr("people")) names[p.Str("key") ?? ""] = p.Str("name");

        MyAngle = 0;
        foreach (var c in snap.Arr("chairs")) if (c.Str("owner") == me) MyAngle = (float)c.Num("angle");
        board.localRotation = Quaternion.Euler(0, MyAngle, 0);

        float h = FELT_TOP;
        foreach (var f in snap.Arr("felt"))
        {
            h += LAYER;
            Card(f, (float)f.Num("x"), (float)f.Num("y"), (float)f.Num("angle"), h, 1, faces, back, f.Flag("up"));
        }

        foreach (var p in snap.Arr("piles"))
        {
            float px = (float)p.Num("x"), py = (float)p.Num("y"), pa = (float)p.Num("angle");
            var cards = p.Arr("cards");
            if (p.Str("pose") == "ring")
            {
                float rh = h;
                foreach (var c in cards)
                {
                    rh += LAYER;
                    float t = (float)c.Num("turn") * Mathf.Deg2Rad;
                    Card(c, px + RING_LAY * Mathf.Sin(t), py - RING_LAY * Mathf.Cos(t), Facing((float)c.Num("turn") + 180), rh, 1, faces, back, c.Flag("up"));
                }
                continue;
            }
            if (cards.Count == 0) continue;
            // Стопка: тело толщиной в число карт и верхняя карта на нём.
            float thick = cards.Count * LAYER * .5f;
            var body = Solid("Stack", board, cube, new Color(.86f, .84f, .78f));
            body.localPosition = At(px, py, h + thick / 2);
            body.localRotation = Quaternion.Euler(0, pa, 0);
            body.localScale = new Vector3(UNIT * .98f, thick, 1.4f * UNIT * .98f);
            var top = cards[cards.Count - 1];
            Card(top, px, py, pa, h + thick + LAYER, 1, faces, back, top.Flag("up"));
        }

        foreach (var c in snap.Arr("chairs"))
        {
            float a = (float)c.Num("angle"), t = a * Mathf.Deg2Rad;
            bool mine = c.Str("owner") == me;
            float sx = Mathf.Sin(t) * SEAT_RADIUS, sy = Mathf.Cos(t) * SEAT_RADIUS;
            var hand = c.Arr("hand");
            float gap = .42f * HAND_SCALE, mid = (hand.Count - 1) / 2f, ca = Mathf.Cos(-t), sa = Mathf.Sin(-t);
            for (int i = 0; i < hand.Count; i++)
            {
                var card = hand[i];
                float off = (i - mid) * gap;
                // Своя рука — лицом ко мне, пока не перевёрнута; чужая на столе — лицом, если перевёрнута и видна.
                bool face = mine ? !card.Flag("up") : card.Flag("up");
                Card(card, sx + off * ca, sy + off * sa, -a, FELT_TOP + LAYER * (i + 1), HAND_SCALE, faces, back, face);
            }
            var owner = c.Str("owner");
            var label = c.Flag("croupier") ? "крупье" : owner != null && names.TryGetValue(owner, out var n) ? n : "свободно";
            Label(label, (TABLE_RADIUS + .35f) * Mathf.Sin(t), (TABLE_RADIUS + .35f) * Mathf.Cos(t), -a, mine ? new Color(.94f, .78f, .42f) : new Color(.96f, .92f, .82f));
        }
    }

    Vector3 At(float x, float y, float h) => new(x * UNIT, h, -y * UNIT);

    void Card(object card, float x, float y, float angle, float h, float scale, string faces, string back, bool faceUp)
    {
        var node = new GameObject(card.Str("id") ?? "card").transform;
        node.SetParent(board, false);
        node.localPosition = At(x, y, h);
        node.localRotation = Quaternion.Euler(0, angle, 0);
        var face = card.Obj("face");
        var art = faceUp && face != null ? $"Cards/{faces}/{FaceFile(face)}" : $"Cards/backs/{back}";
        var q = new GameObject("art").transform;
        q.SetParent(node, false);
        q.localRotation = Quaternion.Euler(90, 0, 0);
        q.localScale = new Vector3(UNIT * scale, 1.4f * UNIT * scale, 1);
        q.gameObject.AddComponent<MeshFilter>().sharedMesh = quad;
        q.gameObject.AddComponent<MeshRenderer>().sharedMaterial = Art(art);
    }

    static string FaceFile(Dictionary<string, object> face)
    {
        string rank = face.Str("rank"), suit = face.Str("suit");
        if (rank == "JK") return suit == "b" ? "joker-black" : "joker-red";
        var word = suit switch { "s" => "spade", "h" => "heart", "d" => "diamond", _ => "club" };
        return $"{word}-{rank}";
    }

    Material Art(string path)
    {
        if (materials.TryGetValue(path, out var m)) return m;
        var tex = Resources.Load<Texture2D>(path) ?? Resources.Load<Texture2D>("Cards/backs/plaid");
        m = new Material(Shader.Find("Unlit/Transparent")) { mainTexture = tex };
        materials[path] = m;
        return m;
    }

    Transform Solid(string name, Transform parent, Mesh mesh, Color color)
    {
        var obj = new GameObject(name);
        obj.transform.SetParent(parent, false);
        obj.AddComponent<MeshFilter>().sharedMesh = mesh;
        var key = "solid:" + ColorUtility.ToHtmlStringRGB(color);
        if (!materials.TryGetValue(key, out var m)) materials[key] = m = new Material(Shader.Find("Unlit/Color")) { color = color };
        obj.AddComponent<MeshRenderer>().sharedMaterial = m;
        return obj.transform;
    }

    void Label(string text, float x, float y, float angle, Color color)
    {
        var node = new GameObject("name").transform;
        node.SetParent(board, false);
        node.localPosition = At(x, y, .002f);
        node.localRotation = Quaternion.Euler(0, angle, 0) * Quaternion.Euler(90, 0, 0);
        var mesh = node.gameObject.AddComponent<TextMesh>();
        mesh.text = text;
        mesh.font = font;
        mesh.fontSize = 64;
        mesh.characterSize = .0022f;
        mesh.anchor = TextAnchor.MiddleCenter;
        mesh.color = color;
        node.GetComponent<MeshRenderer>().sharedMaterial = font.material;
    }

    /** Угол в −180…180, как `facing` сервера. */
    static float Facing(float deg)
    {
        float d = ((deg + 180) % 360 + 360) % 360 - 180;
        return d == -180 ? 180 : d;
    }
}
