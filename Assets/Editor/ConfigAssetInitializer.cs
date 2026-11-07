using UnityEditor;
using UnityEngine;
using WafersPlease;
using WafersPlease.Config;

public static class ConfigAssetInitializer
{
    const string ConfigPath = "Assets/Config";
    const string MarkerKey = "WafersPlease_ConfigInitialized";

    [InitializeOnLoadMethod]
    static void Init()
    {
        if (SessionState.GetBool(MarkerKey, false)) return;
        SessionState.SetBool(MarkerKey, true);

        int delayFrames = 0;
        void CheckAndCreate()
        {
            delayFrames++;
            if (delayFrames < 10)
            {
                EditorApplication.delayCall += CheckAndCreate;
                return;
            }
            CreateAllAssets();
        }
        EditorApplication.delayCall += CheckAndCreate;
    }

    [MenuItem("Wafers/Create All Config Assets")]
    public static void CreateAllAssets()
    {
        System.IO.Directory.CreateDirectory(ConfigPath);
        CreateDefectProfiles();
        CreateDayConfigs();
        CreateRuleMatrices();
        CreateScoringConfig();
        CreateToolConfigs();
        CreateReworkConfigs();
        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log("[ConfigAssetInitializer] All config assets created.");
    }

    static T CreateAsset<T>(string name) where T : ScriptableObject
    {
        T asset = ScriptableObject.CreateInstance<T>();
        string path = $"{ConfigPath}/{name}.asset";
        AssetDatabase.CreateAsset(asset, path);
        return asset;
    }

    static void CreateDefectProfiles()
    {
        string[][] profiles = new string[][]
        {
            new[] { "Particle_Contamination", "Particle", "Easy", "StylusProfilometer", "Rework" },
            new[] { "Scratch_Shallow", "Scratch", "Easy", "StylusProfilometer", "Rework" },
            new[] { "Stain_Organic", "Stain", "Medium", "SpectroscopicEllipsometry", "Rework" },
            new[] { "Crack_Edge", "Crack", "Hard", "ElectronMicroscope", "Reject" },
            new[] { "Misalignment_Layer", "Misalignment", "Medium", "XRayRefractometry", "Reject" },
            new[] { "Bridge_Submicron", "Bridge", "Hidden", "ElectronMicroscope", "Reject" }
        };

        foreach (string[] data in profiles)
        {
            DefectProfileSO profile = CreateAsset<DefectProfileSO>(data[0]);
            profile.displayName = data[0].Replace('_', ' ');
            profile.defectType = (DefectType)System.Enum.Parse(typeof(DefectType), data[1]);
            profile.detectionDifficulty = (DetectionDifficulty)System.Enum.Parse(typeof(DetectionDifficulty), data[2]);
            profile.requiredTool = (ToolType)System.Enum.Parse(typeof(ToolType), data[3]);
            profile.defaultAction = ActionPath.Reject;
            profile.reworkAction = (ActionPath)System.Enum.Parse(typeof(ActionPath), data[4]);
            profile.severity = Random.Range(0.2f, 0.9f);
            profile.toleranceThreshold = 0.15f;
            profile.diagnosticIndicators = new[] { "Visual inspection recommended", "Check process log" };
            profile.glossaryEntry = data[1];
            EditorUtility.SetDirty(profile);
        }
    }

    static void CreateDayConfigs()
    {
        string[] days = new[] { "Day1_Training", "Day2_Standard", "Day3_Certification" };
        for (int i = 0; i < days.Length; i++)
        {
            DayConfigSO day = CreateAsset<DayConfigSO>(days[i]);
            day.dayNumber = i + 1;
            day.briefingText = $"Day {i + 1} briefing. Inspect wafers carefully.";
            day.timeLimitMinutes = 15f + i * 5f;
            day.wafersPerDay = 5 + i * 3;
            day.salaryTarget = 500f + i * 200f;
            day.competencyTarget = 80f - i * 10f;
            day.defectDensity = 0.2f + i * 0.15f;
            day.showContextPrompts = i == 0;
            EditorUtility.SetDirty(day);
        }
    }

    static void CreateRuleMatrices()
    {
        for (int i = 0; i < 3; i++)
        {
            RuleMatrixSO matrix = CreateAsset<RuleMatrixSO>($"RuleMatrix_Day{i + 1}");
            matrix.rules = new RuleEntry[0];
            EditorUtility.SetDirty(matrix);
        }
    }

    static void CreateScoringConfig()
    {
        ScoringConfigSO config = CreateAsset<ScoringConfigSO>("ScoringConfig");
        config.baseSalaryPerWafer = 50f;
        config.correctBonusMultiplier = 1.5f;
        config.incorrectPenaltyMultiplier = 0.5f;
        config.correctCompetencyGain = 2f;
        config.incorrectCompetencyPenalty = -5f;
        config.salaryGradeThresholds = new[] { 300f, 600f, 1000f };
        config.competencyGradeThresholds = new[] { 60f, 75f, 90f };
        EditorUtility.SetDirty(config);
    }

    static void CreateToolConfigs()
    {
        var tools = new (string name, ToolType type, float accuracy, float maxZoom, string desc)[]
        {
            ("Tool_StylusProfilometer", ToolType.StylusProfilometer, 0.85f, 10f, "Contact profilometer for surface roughness"),
            ("Tool_SpectroscopicEllipsometry", ToolType.SpectroscopicEllipsometry, 0.90f, 50f, "Optical film thickness measurement"),
            ("Tool_XRayRefractometry", ToolType.XRayRefractometry, 0.95f, 20f, "X-ray reflectivity for density/film analysis"),
            ("Tool_ElectronMicroscope", ToolType.ElectronMicroscope, 0.98f, 200f, "High-magnification e-beam inspection"),
            ("Tool_FourPointProbe", ToolType.FourPointProbe, 0.88f, 1f, "Sheet resistance measurement")
        };

        foreach (var (name, type, accuracy, maxZoom, desc) in tools)
        {
            ToolConfigSO config = CreateAsset<ToolConfigSO>(name);
            config.toolType = type;
            config.accuracy = accuracy;
            config.maxZoom = maxZoom;
            config.description = desc;
            config.measurementUnit = type switch
            {
                ToolType.StylusProfilometer => "nm",
                ToolType.SpectroscopicEllipsometry => "nm",
                ToolType.XRayRefractometry => "nm",
                ToolType.ElectronMicroscope => "nm",
                ToolType.FourPointProbe => "Ω/sq",
                _ => ""
            };
            EditorUtility.SetDirty(config);
        }
    }

    static void CreateReworkConfigs()
    {
        var reworks = new (string name, ReworkType type, float idealTime, string desc)[]
        {
            ("Rework_RCAClean", ReworkType.RCAClean, 30f, "RCA Standard Clean"),
            ("Rework_SilicideWetEtch", ReworkType.SilicideWetEtch, 45f, "Silicide wet etch correction"),
            ("Rework_CMPCalibration", ReworkType.CMPCalibration, 60f, "CMP calibration rework")
        };

        foreach (var (name, type, idealTime, desc) in reworks)
        {
            ReworkConfigSO config = CreateAsset<ReworkConfigSO>(name);
            config.type = type;
            config.instructionsText = desc;
            config.idealTimingSeconds = idealTime;
            config.toleranceWindowSeconds = idealTime * 0.5f;
            config.failurePenalty = 1.0f;
            config.stepDescriptions = new[] { "Prepare", "Execute", "Verify" };
            EditorUtility.SetDirty(config);
        }
    }
}
