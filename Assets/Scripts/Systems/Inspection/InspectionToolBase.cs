using UnityEngine;
using WafersPlease;
using WafersPlease.Config;
using WafersPlease.Core;

namespace WafersPlease.Systems.Inspection
{
    public enum InspectionToolType
    {
        MacroInspection,
        Microscope,
        Profilometer,
        Ellipsometer,
        EBeam
    }

    public class InspectionToolBase : MonoBehaviour
    {
        public InspectionToolType toolType;
        public ToolConfigSO toolConfig;

        public bool IsActive { get; private set; }
        public float ZoomLevel { get; private set; } = 1f;

        public virtual void Activate()
        {
            IsActive = true;
            gameObject.SetActive(true);
        }

        public virtual void Deactivate()
        {
            IsActive = false;
            gameObject.SetActive(false);
        }

        public virtual void SetZoom(float zoom)
        {
            ZoomLevel = Mathf.Clamp(zoom, 1f, toolConfig != null ? toolConfig.maxZoom : 100f);
        }

        public virtual MetrologyData PerformMeasurement(float rawValue, string unit, float thresholdLow, float thresholdHigh)
        {
            float accuracy = toolConfig != null ? toolConfig.accuracy : 0.9f;
            float noise = 1f - accuracy;
            float measured = rawValue + Random.Range(-noise, noise);
            string[] indicators = System.Array.Empty<string>();

            return new MetrologyData
            {
                sourceTool = toolConfig != null ? toolConfig.toolType : ToolType.StylusProfilometer,
                primaryValue = measured,
                unit = unit,
                thresholdMin = thresholdLow,
                thresholdMax = thresholdHigh,
                diagnosticIndicators = indicators,
                isOutOfSpec = measured < thresholdLow || measured > thresholdHigh
            };
        }
    }
}
