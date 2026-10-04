using UnityEngine;

namespace WafersPlease.Config
{
    [CreateAssetMenu(fileName = "NewReworkConfig", menuName = "Wafers/Rework Config")]
    public class ReworkConfigSO : ScriptableObject
    {
        public ReworkType type;
        public string instructionsText;
        public float idealTimingSeconds;
        public float toleranceWindowSeconds;
        public float failurePenalty;
        public string[] stepDescriptions;
    }
}
