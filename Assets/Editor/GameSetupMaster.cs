using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using WafersPlease;
using WafersPlease.Config;
using WafersPlease.Core;
using WafersPlease.Interaction;
using WafersPlease.Systems.Analytics;
using WafersPlease.Systems.Decision;
using WafersPlease.Systems.Inspection;
using WafersPlease.Systems.Progression;
using WafersPlease.Systems.Scoring;
using WafersPlease.Systems.UI;
using WafersPlease.Systems.Wafers;

public static class GameSetupMaster
{
    const string ScenePath = "Assets/Scenes/GameScene.unity";
    const string PrefabsDir = "Assets/Prefabs";

    [MenuItem("Wafers/Setup/Full Scene + Systems")]
    public static void FullSetup()
    {
        System.IO.Directory.CreateDirectory(PrefabsDir);

        Scene scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
        EditorSceneManager.SetActiveScene(scene);

        SetupEnvironment();
        CreateWaferPrefab();
        CreateSystems();
        PostProcessScene();

        EditorSceneManager.SaveScene(scene, ScenePath);
        AssetDatabase.Refresh();
        Debug.Log($"[GameSetupMaster] Full setup complete. Scene saved to {ScenePath}");
    }

    static void SetupEnvironment()
    {
        RenderSettings.ambientMode = AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = new Color(0.48f, 0.52f, 0.6f);
        RenderSettings.ambientEquatorColor = new Color(0.36f, 0.39f, 0.46f);
        RenderSettings.ambientGroundColor = new Color(0.22f, 0.23f, 0.27f);
        RenderSettings.ambientIntensity = 1.35f;

        SetupLights();
        SetupCamera();
        PlaceModels();
    }

    static void SetupLights()
    {
        var lightObj = GameObject.Find("Directional Light") ?? new GameObject("Directional Light");
        Light light = lightObj.GetComponent<Light>();
        if (light == null) light = lightObj.AddComponent<Light>();
        light.type = LightType.Directional;
        light.color = new Color(1f, 0.95f, 0.85f);
        light.intensity = 1.2f;
        light.shadows = LightShadows.Soft;
        lightObj.transform.position = new Vector3(2f, 5f, 0f);
        lightObj.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

        var fillObj = new GameObject("Fill Light");
        Light fill = fillObj.AddComponent<Light>();
        fill.type = LightType.Directional;
        fill.color = new Color(0.6f, 0.7f, 1f);
        fill.intensity = 0.4f;
        fill.shadows = LightShadows.None;
        fillObj.transform.position = new Vector3(-3f, 3f, 2f);
        fillObj.transform.rotation = Quaternion.Euler(30f, 130f, 0f);
    }

    static void SetupCamera()
    {
        Camera cam = Camera.main;
        if (cam == null)
        {
            var go = new GameObject("Main Camera");
            cam = go.AddComponent<Camera>();
            go.tag = "MainCamera";
        }
        cam.transform.position = new Vector3(0f, 0.8f, 0.6f);
        cam.transform.rotation = Quaternion.Euler(30f, 0f, 0f);
        cam.nearClipPlane = 0.01f;
        cam.farClipPlane = 20f;
        cam.fieldOfView = 45f;
    }

    static void PlaceModels()
    {
        PlaceModel("Room", Vector3.zero, Quaternion.identity, new Vector3(2f, 2f, 2f));
        PlaceModel("Workbench", new Vector3(0f, 0.75f, 0f), Quaternion.identity, new Vector3(1.5f, 1.5f, 1.5f));
        PlaceModel("Foup", new Vector3(-0.6f, 0.76f, 0.2f), Quaternion.Euler(0f, 90f, 0f), Vector3.one);
        PlaceModel("Console", new Vector3(0.8f, 0f, 0.5f), Quaternion.Euler(0f, -90f, 0f), new Vector3(1.2f, 1.2f, 1.2f));
        PlaceModel("DataSlate", new Vector3(0.3f, 0.76f, -0.2f), Quaternion.Euler(-15f, 20f, 0f), Vector3.one * 0.8f);
        PlaceModel("Inspection", new Vector3(-0.5f, 0.76f, -0.3f), Quaternion.identity, Vector3.one);
        PlaceModel("IncidentReport", new Vector3(0.1f, 0.76f, -0.4f), Quaternion.Euler(-10f, 15f, 0f), Vector3.one * 0.7f);
    }

    static void PlaceModel(string modelName, Vector3 pos, Quaternion rot, Vector3 scale)
    {
        string path = $"Assets/Models/{modelName}.glb";
        GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
        if (prefab == null)
        {
            Debug.LogWarning($"[GameSetupMaster] Model {modelName} not found at {path}");
            return;
        }
        GameObject instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
        instance.transform.SetPositionAndRotation(pos, rot);
        instance.transform.localScale = scale;
        instance.name = modelName;
    }

    static void CreateWaferPrefab()
    {
        string prefabPath = "Assets/Prefabs/Wafer.prefab";
        if (AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath) != null) return;

        GameObject waferModel = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Models/Wafer.glb");
        if (waferModel == null)
        {
            waferModel = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            waferModel.name = "Wafer";
            waferModel.transform.localScale = new Vector3(0.15f, 0.01f, 0.15f);
        }

        GameObject instance = (GameObject)PrefabUtility.InstantiatePrefab(waferModel);
        instance.AddComponent<WaferController>();

        PrefabUtility.SaveAsPrefabAsset(instance, prefabPath);
        Object.DestroyImmediate(instance);
        Debug.Log($"[GameSetupMaster] Wafer prefab created at {prefabPath}");
    }

    static void CreateSystems()
    {
        GameObject parent = new GameObject("GameManager");
        GameManager gm = parent.AddComponent<GameManager>();
        parent.AddComponent<DesktopInputAdapter>();
        parent.AddComponent<GameFlowController>();
        parent.AddComponent<PlayerController>();

        DayProgressionController prog = parent.AddComponent<DayProgressionController>();
        ScoreManager score = parent.AddComponent<ScoreManager>();
        AnalyticsTracker analytics = parent.AddComponent<AnalyticsTracker>();

        gm.dayConfigs = FindAllAssets<DayConfigSO>();
        gm.scoringConfig = FindFirstAsset<ScoringConfigSO>("ScoringConfig");
        gm.ruleMatrices = FindAllAssets<RuleMatrixSO>();
        score.scoringConfig = gm.scoringConfig;

        GameEventSO dayStartEvent = GetOrCreateEvent("DayStartEvent");
        GameEventSO dayEndEvent = GetOrCreateEvent("DayEndEvent");
        GameEventSO phaseChangedEvent = GetOrCreateEvent("PhaseChangedEvent");
        prog.dayStartEvent = dayStartEvent;
        prog.dayEndEvent = dayEndEvent;
        prog.shiftPhaseChangedEvent = phaseChangedEvent;

        var spawnerGO = new GameObject("WaferSpawner");
        spawnerGO.transform.SetParent(parent.transform);
        var spawner = spawnerGO.AddComponent<WaferSpawner>();
        spawner.waferPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Prefabs/Wafer.prefab");
        spawner.spawnPoint = spawnerGO.transform;
        spawner.dayConfig = gm.dayConfigs.Length > 0 ? gm.dayConfigs[0] : null;

        var stampGO = new GameObject("StampController");
        stampGO.transform.SetParent(parent.transform);
        stampGO.AddComponent<StampController>();

        var travelerGO = new GameObject("TravelerController");
        travelerGO.transform.SetParent(parent.transform);
        travelerGO.AddComponent<TravelerController>();
    }

    static void PostProcessScene()
    {
        var go = new GameObject("_PostProcess");
        go.tag = "Untagged";
        go.SetActive(false);
        Object.DestroyImmediate(go);
    }

    static T FindFirstAsset<T>(string hint = "") where T : ScriptableObject
    {
        string filter = string.IsNullOrEmpty(hint) ? $"t:{typeof(T).Name}" : $"t:{typeof(T).Name} {hint}";
        string[] guids = AssetDatabase.FindAssets(filter);
        if (guids.Length == 0 && !string.IsNullOrEmpty(hint))
            guids = AssetDatabase.FindAssets($"t:{typeof(T).Name}");
        if (guids.Length == 0) return null;
        return AssetDatabase.LoadAssetAtPath<T>(AssetDatabase.GUIDToAssetPath(guids[0]));
    }

    static T[] FindAllAssets<T>() where T : ScriptableObject
    {
        string[] guids = AssetDatabase.FindAssets($"t:{typeof(T).Name}");
        T[] results = new T[guids.Length];
        for (int i = 0; i < guids.Length; i++)
            results[i] = AssetDatabase.LoadAssetAtPath<T>(AssetDatabase.GUIDToAssetPath(guids[i]));
        return results;
    }

    static GameEventSO GetOrCreateEvent(string name)
    {
        string path = $"Assets/Config/{name}.asset";
        GameEventSO existing = AssetDatabase.LoadAssetAtPath<GameEventSO>(path);
        if (existing != null) return existing;
        GameEventSO evt = ScriptableObject.CreateInstance<GameEventSO>();
        AssetDatabase.CreateAsset(evt, path);
        return evt;
    }
}
