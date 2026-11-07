using UnityEngine;

namespace WafersPlease.Config
{
    [CreateAssetMenu(fileName = "NewDayConfig", menuName = "Wafers/Day Config")]
    public class DayConfigSO : ScriptableObject
    {
        public int dayNumber;
        public string briefingText;
        public float timeLimitMinutes;
        public int wafersPerDay = 10;
        public float salaryTarget;
        public float competencyTarget;
        public DefectProfileSO[] allowedDefects;
        public ToolType[] availableTools;
        public float defectDensity = 0.3f;
        public bool showContextPrompts = true;

        public DefectProfileSO[] GenerateDefectSet()
        {
            if (allowedDefects == null || allowedDefects.Length == 0)
            {
                Debug.LogWarning($"[DayConfig] {name}: allowedDefects is empty!");
                return System.Array.Empty<DefectProfileSO>();
            }

            // Build a shuffled pool of the valid profiles so which defects appear
            // (and in what order) varies from wafer to wafer instead of repeating.
            var pool = new System.Collections.Generic.List<DefectProfileSO>();
            foreach (var p in allowedDefects)
                if (p != null) pool.Add(p);

            // Fisher-Yates shuffle
            for (int i = pool.Count - 1; i > 0; i--)
            {
                int j = Random.Range(0, i + 1);
                (pool[i], pool[j]) = (pool[j], pool[i]);
            }

            // Decide how many defects this wafer has. defectDensity biases toward
            // more defects, but every wafer rolls independently so we get a healthy
            // mix of clean / 1 / 2 / 3-defect wafers.
            int maxDefects = Mathf.Min(pool.Count, 3);
            int count = 0;
            for (int i = 0; i < maxDefects; i++)
                if (Random.value < defectDensity) count++;

            var defects = new System.Collections.Generic.List<DefectProfileSO>();
            for (int i = 0; i < count && i < pool.Count; i++)
                defects.Add(pool[i]);

            Debug.Log($"[DayConfig] {name}: generated {defects.Count} defects from {pool.Count} profiles (density={defectDensity})");
            return defects.ToArray();
        }
    }
}
