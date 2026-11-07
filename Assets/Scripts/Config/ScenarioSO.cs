using UnityEngine;

namespace WafersPlease.Config
{
    [CreateAssetMenu(fileName = "NewScenario", menuName = "Wafers/Scenario")]
    public class ScenarioSO : ScriptableObject
    {
        public int seed;
        public int waferCount;
        public DefectSpawnEntry[] forcedDefects;
    }

    [System.Serializable]
    public struct DefectSpawnEntry
    {
        public DefectProfileSO profile;
        public int waferIndex;
        public float severity;
        public bool guaranteed;
    }
}
