using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEngine;
using UnityEngine.XR.Management;

public static class PrototypeBuild
{
    public static void Prepare()
    {
        PlayerSettings.companyName = "Crossade";
        PlayerSettings.productName = "Crossade AR Prototype";
        PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.iOS, "com.crossade.arprototype");
        PlayerSettings.SetScriptingBackend(NamedBuildTarget.iOS, ScriptingImplementation.IL2CPP);
        PlayerSettings.iOS.targetOSVersionString = "15.0";
        PlayerSettings.iOS.cameraUsageDescription = "Place the card table on a real surface and walk around it.";
        PlayerSettings.iOS.appleEnableAutomaticSigning = true;
        // Owner's free Personal Team; another team comes through the environment.
        var team = Environment.GetEnvironmentVariable("CROSSADE_APPLE_TEAM");
        PlayerSettings.iOS.appleDeveloperTeamID = string.IsNullOrEmpty(team) ? "49HDCB8S45" : team;
        PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
        PlayerSettings.colorSpace = ColorSpace.Linear;
        PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.iOS, false);
        PlayerSettings.SetGraphicsAPIs(BuildTarget.iOS, new[] { UnityEngine.Rendering.GraphicsDeviceType.Metal });
        // TablePrototype makes its materials from Shader.Find at runtime; a shader no asset references is stripped from the build.
        var graphics = new SerializedObject(AssetDatabase.LoadAssetAtPath<UnityEngine.Rendering.GraphicsSettings>("ProjectSettings/GraphicsSettings.asset"));
        var always = graphics.FindProperty("m_AlwaysIncludedShaders");
        foreach (var name in new[] { "Unlit/Color", "Unlit/Transparent" })
        {
            var shader = Shader.Find(name);
            bool listed = false;
            for (int i = 0; i < always.arraySize; i++) listed |= always.GetArrayElementAtIndex(i).objectReferenceValue == shader;
            if (listed) continue;
            always.InsertArrayElementAtIndex(always.arraySize);
            always.GetArrayElementAtIndex(always.arraySize - 1).objectReferenceValue = shader;
        }
        graphics.ApplyModifiedProperties();
        // Ссылка из Telegram открывает приложение по этой схеме: crossade://table?room=…&pass=…&host=…
        PlayerSettings.iOS.iOSUrlSchemes = new[] { "crossade" };
        BakeCards();

        var perTarget = AssetDatabase.LoadAssetAtPath<XRGeneralSettingsPerBuildTarget>("Assets/XRSettings.asset");
        if (perTarget == null)
        {
            perTarget = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
            AssetDatabase.CreateAsset(perTarget, "Assets/XRSettings.asset");
        }
        EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, perTarget, true);
        var general = perTarget.SettingsForBuildTarget(BuildTargetGroup.iOS);
        if (general == null)
        {
            general = ScriptableObject.CreateInstance<XRGeneralSettings>();
            AssetDatabase.AddObjectToAsset(general, perTarget);
            perTarget.SetSettingsForBuildTarget(BuildTargetGroup.iOS, general);
        }
        if (general.Manager == null)
        {
            general.Manager = ScriptableObject.CreateInstance<XRManagerSettings>();
            AssetDatabase.AddObjectToAsset(general.Manager, perTarget);
        }
        general.InitManagerOnStart = true;
        // The ARKit package sets this define itself only in the editor UI, never in batch mode, and without it its build
        // step leaves libUnityARKit.a out — AR then sits in state None. Takes effect from the next Unity launch.
        var defines = PlayerSettings.GetScriptingDefineSymbols(NamedBuildTarget.iOS);
        if (!defines.Contains("UNITY_XR_ARKIT_LOADER_ENABLED"))
            PlayerSettings.SetScriptingDefineSymbols(NamedBuildTarget.iOS, (defines + ";UNITY_XR_ARKIT_LOADER_ENABLED").Trim(';'));
        if (!XRPackageMetadataStore.AssignLoader(general.Manager, "UnityEngine.XR.ARKit.ARKitLoader", BuildTargetGroup.iOS))
            throw new Exception("Could not configure ARKit loader");

        Directory.CreateDirectory("Assets/Scenes");
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        new GameObject("Prototype").AddComponent<TablePrototype>();
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/Table.unity");
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene("Assets/Scenes/Table.unity", true) };
        EditorUtility.SetDirty(perTarget);
        EditorUtility.SetDirty(general);
        EditorUtility.SetDirty(general.Manager);
        AssetDatabase.SaveAssets();
        Debug.Log("CROSSADE_PREPARED");
    }

    /**
     * КАРТЫ — те же растры, что у веба (`game-presets/cards/src/decks/baked`), но в PNG: WebP Unity не читает.
     * Переводит `sips` из macOS; готовые не трогает. Набор — обычный и минимальный, плюс рубашки.
     */
    static void BakeCards()
    {
        var from = Path.GetFullPath("../../game-presets/cards/src/decks/baked");
        bool added = false;
        foreach (var set in new[] { "classic", "minimal", "backs" })
        {
            var to = Path.Combine("Assets/Resources/Cards", set);
            Directory.CreateDirectory(to);
            foreach (var webp in Directory.GetFiles(Path.Combine(from, set), "*.webp"))
            {
                var png = Path.Combine(to, Path.GetFileNameWithoutExtension(webp) + ".png");
                if (File.Exists(png)) continue;
                var sips = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("/usr/bin/sips", $"-s format png \"{webp}\" --out \"{png}\"") { UseShellExecute = false, RedirectStandardOutput = true });
                sips.WaitForExit();
                if (sips.ExitCode != 0) throw new Exception("sips failed: " + webp);
                added = true;
            }
        }
        if (added) AssetDatabase.Refresh();
    }

    public static void ExportIOS()
    {
        Prepare();
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
            scenes = new[] { "Assets/Scenes/Table.unity" },
            locationPathName = "Builds/iOS",
            target = BuildTarget.iOS,
            options = BuildOptions.Development
        });
        if (report.summary.result != BuildResult.Succeeded)
            throw new Exception("iOS export failed: " + report.summary.result);
        Debug.Log("CROSSADE_IOS_EXPORTED");
    }
}
