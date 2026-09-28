// ИНДИКАТОРЫ СТОПОК — как у веба (`gripHtml`, `gripPress`): под каждой стопкой плашка с числом карт.
//
//   тап         — окно стопки (`PileTip`): перемешать, отсортировать, перевернуть, флаги;
//   двойной тап — перевернуть стопку целиком;
//   тяга        — стопка едет за пальцем и встаёт, где отпустили (`deckMove`). Приколотую не тянут.
//
// У круга хода плашка стоит в его середине — там пусто, и она не закроет ни одной карты.

using System;
using System.Collections.Generic;
using Crossade.Table;
using Crossade.Wire;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Crossade.View
{
    public sealed class PileGrips : MonoBehaviour
    {
        const float DOUBLE_S = .35f, TAP_PX = 10;

        Hud hud;
        Board board;
        HandRig hand;
        Func<Store> store;
        Action redraw;
        readonly Dictionary<string, Grip> grips = new();
        PileTip tip;
        float lastTap = -1;
        string lastTapPile;

        public static PileGrips Make(Hud hud, Board board, HandRig hand, Func<Store> store, Action redraw)
        {
            var g = new GameObject("pile grips", typeof(RectTransform)).AddComponent<PileGrips>();
            g.transform.SetParent(hud.transform, false);
            Ui.Fill((RectTransform)g.transform);
            g.hud = hud;
            g.board = board;
            g.hand = hand;
            g.store = store;
            g.redraw = redraw;
            g.tip = PileTip.Make(hud, store);
            return g;
        }

        public string Open => tip.Pile;

        public void Sync()
        {
            var s = store()?.S;
            var alive = new HashSet<string>();
            if (s != null)
                foreach (var pile in s.Piles)
                {
                    alive.Add(pile.Id);
                    if (!grips.TryGetValue(pile.Id, out var g)) grips[pile.Id] = g = Grip.Make(this, pile.Id);
                    g.Show(pile, tip.Pile == pile.Id);
                }
            foreach (var id in new List<string>(grips.Keys))
                if (!alive.Contains(id))
                {
                    Destroy(grips[id].gameObject);
                    grips.Remove(id);
                }
            tip.Sync();
        }

        void LateUpdate()
        {
            var s = store()?.S;
            if (s == null) return;
            var cam = board.Hand != null ? Camera.main : null;
            if (cam == null) return;
            foreach (var pile in s.Piles)
            {
                if (!grips.TryGetValue(pile.Id, out var g)) continue;
                var (x, y) = board.PileAt(pile);
                // Под нижней картой стопки: край карты, ближний ко мне, чуть дальше.
                var near = pile.Ring ? Board.At(x, y) : Board.At(x, y + .95);
                var at = cam.WorldToScreenPoint(board.Table.TransformPoint(near));
                g.Place(at.z > 0 ? (Vector2)at / hand.Dpr : new Vector2(-999, -999));
            }
        }

        void Tap(string pile)
        {
            var now = Time.realtimeSinceStartup;
            if (lastTapPile == pile && now - lastTap < DOUBLE_S)
            {
                lastTapPile = null;
                tip.Show(null);
                store()?.Act(Intents.DeckDo(pile, "flip"));
                return;
            }
            lastTapPile = pile;
            lastTap = now;
            tip.Show(tip.Pile == pile ? null : pile);
            Sync();
        }

        void Moved(string pile, Vector2 screen)
        {
            var desk = board.ToDesk(Camera.main.ScreenPointToRay(screen));
            if (desk == null) return;
            var p = desk.Value;
            var max = (float)Ring.TableRadius - 1.2f;
            if (p.magnitude > max) p *= max / p.magnitude;
            board.Moving = (pile, p.x, p.y);
            redraw();
        }

        void Dropped(string pile)
        {
            if (board.Moving is { } m && m.pile == pile)
            {
                store()?.Act(Intents.DeckMove(pile, m.x, m.y));
                // Ответ стола придёт следом; до него стопка стоит, где отпустили.
                var p = store()?.S?.Piles.Find(x => x.Id == pile);
                if (p != null)
                {
                    p.X = m.x;
                    p.Y = m.y;
                }
            }
            board.Moving = null;
            redraw();
        }

        sealed class Grip : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
        {
            PileGrips owner;
            string pile;
            RectTransform face;
            Image paint;
            Text count;
            Vector2 downAt;
            bool moved, pinned;

            public static Grip Make(PileGrips owner, string pile)
            {
                var root = Ui.Box(owner.transform, "grip " + pile, Look.Black);
                root.anchorMin = root.anchorMax = Vector2.zero;
                root.pivot = new Vector2(.5f, 1);
                root.sizeDelta = new Vector2(58, 24);
                root.GetComponent<Image>().raycastTarget = true;
                var g = root.gameObject.AddComponent<Grip>();
                g.owner = owner;
                g.pile = pile;
                g.face = Ui.Fill(Ui.Box(root, "face", Look.PanelLight));
                g.face.offsetMin = new Vector2(2, 2);
                g.face.offsetMax = new Vector2(-2, -2);
                g.paint = g.face.GetComponent<Image>();
                // Значок колоды: две карточки внахлёст.
                for (int i = 0; i < 2; i++)
                {
                    var card = Ui.Box(g.face, "card", Look.Black, false);
                    card.anchorMin = card.anchorMax = new Vector2(0, .5f);
                    card.sizeDelta = new Vector2(9, 12);
                    card.anchoredPosition = new Vector2(10 + i * 5, i * -1f);
                    var inner = Ui.Fill(Ui.Box(card, "paper", Look.Gold, false));
                    inner.offsetMin = new Vector2(1.5f, 1.5f);
                    inner.offsetMax = new Vector2(-1.5f, -1.5f);
                }
                g.count = Ui.Words(g.face, "", 12, Look.Ink, TextAnchor.MiddleRight);
                ((RectTransform)g.count.transform).offsetMax = new Vector2(-7, 0);
                return g;
            }

            public void Show(Pile p, bool lit)
            {
                count.text = p.Cards.Count.ToString();
                paint.color = lit ? Look.Gold : Look.PanelLight;
                count.color = lit ? Look.Black : Look.Ink;
                pinned = p.Pin;
            }

            public void Place(Vector2 at) => ((RectTransform)transform).anchoredPosition = at;

            public void OnPointerDown(PointerEventData e)
            {
                downAt = e.position;
                moved = false;
            }

            public void OnDrag(PointerEventData e)
            {
                if (pinned) return;
                if (!moved && (e.position - downAt).magnitude / owner.hand.Dpr < TAP_PX) return;
                moved = true;
                owner.Moved(pile, e.position);
            }

            public void OnPointerUp(PointerEventData e)
            {
                if (moved) owner.Dropped(pile);
                else owner.Tap(pile);
            }
        }
    }

    /** ОКНО СТОПКИ — имя и число карт, что с ней сделать и её флаги (`deckTipHtml` у веба). */
    public sealed class PileTip : MonoBehaviour
    {
        Func<Store> store;
        RectTransform panel;
        public string Pile { get; private set; }

        public static PileTip Make(Hud hud, Func<Store> store)
        {
            var t = new GameObject("pile tip", typeof(RectTransform)).AddComponent<PileTip>();
            t.transform.SetParent(hud.transform, false);
            Ui.Fill((RectTransform)t.transform);
            t.store = store;
            return t;
        }

        public void Show(string pile)
        {
            Pile = pile;
            Sync();
        }

        public void Sync()
        {
            if (panel != null) Destroy(panel.gameObject);
            panel = null;
            var s = store()?.S;
            var p = Pile == null ? null : s?.Piles.Find(x => x.Id == Pile);
            if (p == null)
            {
                Pile = null;
                return;
            }
            var admin = s.Rights.Contains("pile.guard");
            panel = Ui.Box(transform, "panel", Look.Black);
            panel.anchorMin = panel.anchorMax = new Vector2(.5f, 1);
            panel.pivot = new Vector2(.5f, 1);
            panel.sizeDelta = new Vector2(340, 150);
            panel.anchoredPosition = new Vector2(0, -70);
            var body = Ui.Fill(Ui.Box(panel, "well", Look.Well));
            body.offsetMin = new Vector2(3, 3);
            body.offsetMax = new Vector2(-3, -3);

            var name = Ui.Words(body, $"{p.Name ?? (p.Id == Protocol.MainPile ? "Колода" : "Стопка")} · {p.Cards.Count}", 14, Look.Ink, TextAnchor.MiddleLeft);
            Ui.Row((RectTransform)name.transform, 8, 30, 0);
            var shut = Ui.Button(body, "Закрыть", () => Show(null), Look.Well, Look.InkDim, 11);
            Place(shut, 250, 8, 80, 30);

            var pile = p.Id;
            // Что сделать со стопкой — пока она не под локом.
            Chip(body, "Перемешать", 12, 46, 104, !p.Lock, false, () => store().Act(Intents.DeckDo(pile, "shuffle")));
            Chip(body, "Отсортировать", 120, 46, 110, !p.Lock, false, () => store().Act(Intents.DeckDo(pile, "sort")));
            Chip(body, "Перевернуть", 234, 46, 94, !p.Lock, false, () => store().Act(Intents.DeckDo(pile, "flip")));
            // Флаги: приколоть — любой, открепить — админ; лок, приёмка, мерж — админ; вечная — любой.
            Chip(body, "Приколоть", 12, 90, 76, !p.Pin || admin, p.Pin, () => store().Act(Intents.DeckPin(pile, !p.Pin)));
            Chip(body, "Лок", 92, 90, 46, admin, p.Lock, () => store().Act(Intents.DeckGuard(pile, "lock", !p.Lock)));
            Chip(body, "Приёмка", 142, 90, 66, admin, p.Shut, () => store().Act(Intents.DeckGuard(pile, "shut", !p.Shut)));
            Chip(body, "Мерж", 212, 90, 52, admin, p.Seal, () => store().Act(Intents.DeckGuard(pile, "seal", !p.Seal)));
            Chip(body, "Вечная", 268, 90, 60, true, p.Forever, () => store().Act(Intents.DeckForever(pile, !p.Forever)));
        }

        static void Place(Button b, float x, float y, float w, float h)
        {
            var r = (RectTransform)b.transform;
            r.anchorMin = r.anchorMax = new Vector2(0, 1);
            r.pivot = new Vector2(0, 1);
            r.anchoredPosition = new Vector2(x, -y);
            r.sizeDelta = new Vector2(w, h);
        }

        /** Кнопка-флажок: горит, если флаг стоит; нельзя — полупрозрачная и не жмётся. */
        static void Chip(Transform parent, string text, float x, float y, float w, bool may, bool on, Action click)
        {
            var b = Ui.Button(parent, text, () =>
            {
                if (may) click();
            }, on ? Look.Gold : Look.PanelLight, on ? Look.Black : Look.Ink, 11);
            Place(b, x, y, w, 36);
            b.interactable = may;
            var group = b.gameObject.AddComponent<CanvasGroup>();
            group.alpha = may ? 1 : .4f;
        }
    }
}
