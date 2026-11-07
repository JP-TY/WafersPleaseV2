using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using WafersPlease;
using WafersPlease.Config;
using WafersPlease.Core;
using WafersPlease.Interaction;
using WafersPlease.Systems.Analytics;
using WafersPlease.Systems.Inspection;
using WafersPlease.Systems.Progression;
using WafersPlease.Systems.Scoring;
using WafersPlease.Systems.UI;
using WafersPlease.Systems.Wafers;

public static class GameSystemWiring
{
    const string ScenePath = "Assets/Scenes/GameScene.unity";
    const string PrefabsDir = "Assets/Prefabs";

    [MenuItem("Wafers/Systems/Wire All Systems")]
    public static void WireAllSystems()
    {
        Debug.Log("[GameSystemWiring] Starting system wiring...");

        CreateWaferPrefab();
        CreateGameManager();
        WireInputAdapter();
        SaveAndRefresh();
        Debug.Log("[GameSystemWiring] System wiring complete.");
    }

    static void SaveAndRefresh()
    {
        var scene = SceneManager.GetActiveScene();
        EditorSceneManager.SaveScene(scene);
        AssetDatabase.Refresh();
    }

    static GameObject EnsureManagerParent()
    {
        GameObject parent = GameObject.Find("GameManager");
        if (parent != null) return parent;
        parent = new GameObject("GameManager");
        return parent;
    }

    static void CreateGameManager()
    {
        GameObject parent = EnsureManagerParent();
        GameManager gm = parent.GetComponent<GameManager>();
        if (gm == null) gm = parent.AddComponent<GameManager>();

        parent.AddComponent<DesktopInputAdapter>();

        DayProgressionController prog = parent.GetComponent<DayProgressionController>();
        if (prog == null) prog = parent.AddComponent<DayProgressionController>();

        ScoreManager score = parent.GetComponent<ScoreManager>();
        if (score == null) score = parent.AddComponent<ScoreManager>();

        AnalyticsTracker analytics = parent.GetComponent<AnalyticsTracker>();
        if (analytics == null) analytics = parent.AddComponent<AnalyticsTracker>();

        gm.dayConfigs = FindAssetsOfType<DayConfigSO>();
        gm.scoringConfig = FindFirstAsset<ScoringConfigSO>("ScoringConfig");
        gm.ruleMatrices = FindAssetsOfType<RuleMatrixSO>();
        score.scoringConfig = gm.scoringConfig;

        GameObject spawnerGO = new GameObject("WaferSpawner");
        spawnerGO.transform.SetParent(parent.transform);
        WaferSpawner spawner = spawnerGO.AddComponent<WaferSpawner>();
        spawner.waferPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Prefabs/Wafer.prefab");
        spawner.spawnPoint = spawnerGO.transform;
        spawner.dayConfig = gm.dayConfigs.Length > 0 ? gm.dayConfigs[0] : null;

        GameObject stampGO = new GameObject("StampController");
        stampGO.transform.SetParent(parent.transform);
        stampGO.AddComponent<StampController>();

        Debug.Log("[GameSystemWiring] GameManager wired successfully.");
    }

    static void WireInputAdapter()
    {
        GameObject parent = GameObject.Find("GameManager");
        if (parent == null) return;
        if (parent.GetComponent<DesktopInputAdapter>() == null)
            parent.AddComponent<DesktopInputAdapter>();
    }

    static void CreateWaferPrefab()
    {
        GameObject waferModel = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Models/Wafer.glb");
        if (waferModel == null)
        {
            Debug.LogWarning("[GameSystemWiring] Wafer model not found, creating placeholder.");
            waferModel = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            waferModel.name = "Wafer";
            waferModel.transform.localScale = new Vector3(0.15f, 0.01f, 0.15f);
        }

        GameObject waferInstance = (GameObject)PrefabUtility.InstantiatePrefab(waferModel);
        waferInstance.AddComponent<WaferController>();

        string prefabPath = "Assets/Prefabs/Wafer.prefab";
        PrefabUtility.SaveAsPrefabAsset(waferInstance, prefabPath);
        Object.DestroyImmediate(waferInstance);
        Debug.Log($"[GameSystemWiring] Wafer prefab created at {prefabPath}");
    }

    static T FindFirstAsset<T>(string name) where T : ScriptableObject
    {
        string[] guids = AssetDatabase.FindAssets($"t:{typeof(T).Name} {name}");
        if (guids.Length == 0) guids = AssetDatabase.FindAssets($"t:{typeof(T).Name}");
        if (guids.Length == 0) return null;
        return AssetDatabase.LoadAssetAtPath<T>(AssetDatabase.GUIDToAssetPath(guids[0]));
    }

    static T[] FindAssetsOfType<T>() where T : ScriptableObject
    {
        string[] guids = AssetDatabase.FindAssets($"t:{typeof(T).Name}");
        T[] results = new T[guids.Length];
        for (int i = 0; i < guids.Length; i++)
            results[i] = AssetDatabase.LoadAssetAtPath<T>(AssetDatabase.GUIDToAssetPath(guids[i]));
        return results;
    }
}
