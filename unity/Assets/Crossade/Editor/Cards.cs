// КАРТЫ — те же растры, что у веба (`game-presets/cards/src/decks/baked`), но в PNG: WebP Unity не читает.
// Переводит `sips` из macOS в `Assets/Resources/Cards` (в git не лежат — производные); готовые не трогает.
//
//   Unity -batchmode -projectPath unity -executeMethod Crossade.Editor.Cards.Bake -quit

using System;
using System.Diagnostics;
using System.IO;
using UnityEditor;

namespace Crossade.Editor
{
    public static class Cards
    {
        static readonly string[] Sets = { "classic", "minimal", "backs" };

        [MenuItem("Crossade/Bake card art")]
        public static void Bake()
        {
            var from = Path.GetFullPath("../game-presets/cards/src/decks/baked");
            bool added = false;
            foreach (var set in Sets)
            {
                var to = Path.Combine("Assets/Resources/Cards", set);
                Directory.CreateDirectory(to);
                foreach (var webp in Directory.GetFiles(Path.Combine(from, set), "*.webp"))
                {
                    var png = Path.Combine(to, Path.GetFileNameWithoutExtension(webp) + ".png");
                    if (File.Exists(png)) continue;
                    var sips = Process.Start(new ProcessStartInfo("/usr/bin/sips", $"-s format png \"{webp}\" --out \"{png}\"") { UseShellExecute = false, RedirectStandardOutput = true });
                    sips.WaitForExit();
                    if (sips.ExitCode != 0) throw new Exception("sips failed: " + webp);
                    added = true;
                }
            }
            if (added) AssetDatabase.Refresh();
        }
    }
}
