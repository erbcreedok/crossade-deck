// СБОРКА — всё, что нужно приложению, из консоли, без редактора:
//
//   Unity -batchmode -quit -projectPath unity -buildTarget iOS -executeMethod Crossade.Editor.Build.IOS   → Builds/iOS (Xcode)
//   Unity -batchmode -quit -projectPath unity -executeMethod Crossade.Editor.Build.Mac                     → Builds/Mac/Crossade 3D.app
//
// Подпись iOS — у владельца в Xcode (ключ подписи из фоновой оболочки не достаётся). Заставки Unity нет.

using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Crossade.Editor
{
    public static class Build
    {
        const string SCENE = "Assets/Scenes/Main.unity";
        /** Шейдеры, которые вид берёт `Shader.Find`: без ссылки из ассета сборка их выбрасывает. Текст (`GUI/Text Shader`) не нужен и не годится: он из «unity default resources», и сборка на нём падает. */
        static readonly string[] Shaders = { "Standard", "Unlit/Color", "Unlit/Transparent Cutout" };

        public static void Prepare()
        {
            Cards.Bake();
            Scene();
            PlayerSettings.companyName = "Crossade";
            PlayerSettings.productName = "Crossade 3D";
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.iOS, "com.crossade.game");
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "com.crossade.game");
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Standalone, "com.crossade.game");
            // Каждая сборка — свой номер: iOS заменяет приложение только более новым.
            PlayerSettings.bundleVersion = "0.1." + DateTime.UtcNow.ToString("MMddHHmm");
            PlayerSettings.iOS.buildNumber = DateTime.UtcNow.ToString("yyMMddHHmm");
            PlayerSettings.SplashScreen.show = false;
            PlayerSettings.SplashScreen.showUnityLogo = false;
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
            PlayerSettings.runInBackground = true;
            PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.iOS, ManagedStrippingLevel.Minimal);
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.iOS, ScriptingImplementation.IL2CPP);
            PlayerSettings.iOS.targetOSVersionString = "15.0";
            PlayerSettings.iOS.appleEnableAutomaticSigning = true;
            var team = Environment.GetEnvironmentVariable("CROSSADE_APPLE_TEAM");
            PlayerSettings.iOS.appleDeveloperTeamID = string.IsNullOrEmpty(team) ? "49HDCB8S45" : team;
            PlayerSettings.iOS.cameraUsageDescription = "Поставить стол на настоящую поверхность и ходить вокруг него.";
            // Ссылка открывает приложение по своей схеме: crossade3d://table?room=…&key=…&host=… (у Swift-приложения — crossade://).
            PlayerSettings.iOS.iOSUrlSchemes = new[] { "crossade3d" };
            var icon = AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Crossade/Art/icon.png");
            if (icon != null) PlayerSettings.SetIcons(NamedBuildTarget.Unknown, new[] { icon }, IconKind.Any);
            Include();
            // Окно входа Telegram — из AuthenticationServices.
            if (AssetImporter.GetAtPath("Assets/Plugins/iOS/CrossadeLogin.mm") is PluginImporter login)
            {
                login.SetCompatibleWithPlatform(BuildTarget.iOS, true);
                login.SetPlatformData(BuildTarget.iOS, "FrameworkDependencies", "AuthenticationServices;");
                login.SaveAndReimport();
            }
            AssetDatabase.SaveAssets();
        }

        static void Scene()
        {
            if (!File.Exists(SCENE))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(SCENE));
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                EditorSceneManager.SaveScene(scene, SCENE);
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(SCENE, true) };
        }

        static void Include()
        {
            var graphics = new SerializedObject(AssetDatabase.LoadAssetAtPath<GraphicsSettings>("ProjectSettings/GraphicsSettings.asset"));
            var always = graphics.FindProperty("m_AlwaysIncludedShaders");
            foreach (var name in Shaders)
            {
                var shader = Shader.Find(name);
                if (shader == null) throw new Exception("нет шейдера " + name);
                bool listed = false;
                for (int i = 0; i < always.arraySize; i++) listed |= always.GetArrayElementAtIndex(i).objectReferenceValue == shader;
                if (listed) continue;
                always.InsertArrayElementAtIndex(always.arraySize);
                always.GetArrayElementAtIndex(always.arraySize - 1).objectReferenceValue = shader;
            }
            graphics.ApplyModifiedProperties();
        }

        static void Player(BuildTarget target, string path)
        {
            Prepare();
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { SCENE }, locationPathName = path, target = target });
            if (report.summary.result != BuildResult.Succeeded) throw new Exception($"{target}: {report.summary.result}");
            Debug.Log($"CROSSADE_BUILT {target} {path} {report.summary.totalSize / 1024 / 1024} MB");
        }

        public static void IOS() => Player(BuildTarget.iOS, "Builds/iOS");
        public static void Mac() => Player(BuildTarget.StandaloneOSX, "Builds/Mac/Crossade 3D.app");
    }
}
