using System.Collections.Generic;
using UnityEngine;
using WafersPlease.Config;
using WafersPlease.Core;

namespace WafersPlease.Systems.Inspection
{
    public class DefectManager : MonoBehaviour
    {
        [Header("Detection Settings")]
        public float baseDetectionChance = 0.7f;
        public float zoomBonus = 0.2f;

        public DefectProfileSO[] DetectDefects(WaferController wafer, InspectionToolBase tool, float zoomLevel)
        {
            DefectProfileSO[] defects = wafer.GetDefects();
            if (defects.Length == 0) return System.Array.Empty<DefectProfileSO>();

            int hiddenCount = PlayerPrefs.GetInt("HiddenDefects", 0);
            bool revealHidden = hiddenCount >= 3;

            var detected = new List<DefectProfileSO>();
            float toolMultiplier = tool != null && tool.toolConfig != null ? tool.toolConfig.accuracy : 0.5f;
            float effectiveChance = baseDetectionChance + (zoomLevel > 1f ? zoomBonus : 0f);
            effectiveChance *= toolMultiplier;

            foreach (DefectProfileSO defect in defects)
            {
                float detectionRoll = Random.value;
                float threshold = effectiveChance;

                if (defect.detectionDifficulty == DetectionDifficulty.Hidden && !revealHidden)
                {
                    threshold *= 0.2f;
                }

                if (detectionRoll < threshold)
                {
                    detected.Add(defect);
                }
            }

            return detected.ToArray();
        }
    }
}
