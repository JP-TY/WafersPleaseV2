using UnityEngine;

namespace WafersPlease.Config
{
    [CreateAssetMenu(fileName = "NewScoringConfig", menuName = "Wafers/Scoring Config")]
    public class ScoringConfigSO : ScriptableObject
    {
        public float baseSalaryPerWafer;
        public float correctBonusMultiplier;
        public float incorrectPenaltyMultiplier;
        public float correctCompetencyGain;
        public float incorrectCompetencyPenalty;
        public float[] salaryGradeThresholds;
        public float[] competencyGradeThresholds;
    }
}
