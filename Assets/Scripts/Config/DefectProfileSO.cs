using UnityEngine;

namespace WafersPlease.Config
{
    [CreateAssetMenu(fileName = "NewDefectProfile", menuName = "Wafers/Defect Profile")]
    public class DefectProfileSO : ScriptableObject
    {
        public string displayName;
        public DefectClass defectClass;
        public DefectType defectType;
        public DetectionDifficulty detectionDifficulty;
        public ToolType requiredTool;
        public ActionPath defaultAction;
        public ActionPath reworkAction = ActionPath.Rework;
        public float severity;
        public float toleranceThreshold = 0.15f;
        public string[] diagnosticIndicators;
        public string glossaryEntry;
        public string[] remediationReferences;
    }
}
