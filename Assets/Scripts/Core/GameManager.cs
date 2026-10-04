using UnityEngine;
using WafersPlease.Config;

namespace WafersPlease.Core
{
    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        [Header("Day Configuration")]
        public DayConfigSO[] dayConfigs;
        public ScoringConfigSO scoringConfig;
        public RuleMatrixSO[] ruleMatrices;

        public DayConfigSO CurrentDayConfig { get; private set; }
        public RuleMatrixSO CurrentRuleMatrix { get; private set; }
        public int CurrentDayIndex { get; private set; }

        void Awake()
        {
            if (Instance != null)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            gameObject.AddComponent<RuntimeConfigValidator>();
            gameObject.AddComponent<PostProcessingSetup>();
        }

        public void InitializeDay(int dayIndex)
        {
            if (dayIndex < 0 || dayIndex >= dayConfigs.Length)
                return;

            CurrentDayIndex = dayIndex;
            CurrentDayConfig = dayConfigs[dayIndex];
            CurrentRuleMatrix = ruleMatrices.Length > dayIndex ? ruleMatrices[dayIndex] : null;
        }

        public bool HasNextDay()
        {
            return CurrentDayIndex + 1 < dayConfigs.Length;
        }

        public void AdvanceToNextDay()
        {
            InitializeDay(CurrentDayIndex + 1);
        }
    }
}
