using UnityEngine;

namespace WafersPlease.Config
{
    [CreateAssetMenu(fileName = "NewRuleMatrix", menuName = "Wafers/Rule Matrix")]
    public class RuleMatrixSO : ScriptableObject
    {
        public RuleEntry[] rules;

        public RuleEntry FindMatchingRule(DefectType type, float severity)
        {
            if (rules == null) return default;

            foreach (RuleEntry entry in rules)
            {
                if (entry.defect != null && entry.defect.defectType == type && severity >= entry.defect.severity * 0.8f)
                {
                    return entry;
                }
            }
            return default;
        }
    }

    [System.Serializable]
    public struct RuleEntry
    {
        public DefectProfileSO defect;
        public ActionPath correctAction;
        public string ruleText;
        public float toleranceThreshold;
    }
}
