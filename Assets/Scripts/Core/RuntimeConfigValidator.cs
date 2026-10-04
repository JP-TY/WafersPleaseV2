using UnityEngine;
using WafersPlease.Config;

namespace WafersPlease.Core
{
    /// <summary>
    /// Repair-and-report safety net. Day configs, defect profiles, tools, rules and
    /// scoring are authored as real assets under Assets/Config (GDD Sections 7, 9, 10).
    /// This validator only fills in zeroed/blank safety defaults and logs warnings —
    /// it never fabricates defect profiles, so asset data stays the source of truth.
    /// </summary>
    public class RuntimeConfigValidator : MonoBehaviour
    {
        void Start()
        {
            var gm = GameManager.Instance;
            if (gm == null) return;

            ValidateScoringConfig(gm.scoringConfig);
            ValidateDayConfigs(gm.dayConfigs);
        }

        void ValidateScoringConfig(ScoringConfigSO cfg)
        {
            if (cfg == null)
            {
                Debug.LogError("[Validator] ScoringConfig is missing on GameManager.");
                return;
            }
            if (cfg.baseSalaryPerWafer > 0) return;

            Debug.LogWarning("[Validator] ScoringConfig was blank; applying fallback defaults.");
            cfg.baseSalaryPerWafer = 100;
            cfg.correctBonusMultiplier = 2.0f;
            cfg.incorrectPenaltyMultiplier = 0.5f;
            cfg.correctCompetencyGain = 5f;
            cfg.incorrectCompetencyPenalty = 15f;
            cfg.salaryGradeThresholds = new[] { 0f, 500f, 1500f, 3000f };
            cfg.competencyGradeThresholds = new[] { 0f, 30f, 60f, 90f };
        }

        void ValidateDayConfigs(DayConfigSO[] configs)
        {
            if (configs == null)
            {
                Debug.LogError("[Validator] No day configs on GameManager.");
                return;
            }

            for (int i = 0; i < configs.Length; i++)
            {
                var dc = configs[i];
                if (dc == null)
                {
                    Debug.LogError($"[Validator] Day config slot {i} is empty.");
                    continue;
                }
                if (dc.dayNumber <= 0)
                    Debug.LogWarning($"[Validator] '{dc.name}' has dayNumber <= 0.");
                if (dc.allowedDefects == null || dc.allowedDefects.Length == 0)
                    Debug.LogWarning($"[Validator] '{dc.name}' has no allowed defects — wafers will be clean.");
                if (dc.availableTools == null || dc.availableTools.Length == 0)
                    Debug.LogWarning($"[Validator] '{dc.name}' has no available tools.");
                if (dc.wafersPerDay <= 0)
                    Debug.LogWarning($"[Validator] '{dc.name}' has wafersPerDay <= 0.");

                Debug.Log($"[Validator] Day {dc.dayNumber}: {dc.wafersPerDay} wafers, " +
                    $"density {dc.defectDensity}, {dc.allowedDefects?.Length ?? 0} allowed defects, " +
                    $"{dc.availableTools?.Length ?? 0} tools.");
            }
        }
    }
}
