using System;

namespace WafersPlease.Core
{
    [Serializable]
    public struct MetrologyData
    {
        public ToolType sourceTool;
        public float primaryValue;
        public string unit;
        public float thresholdMin;
        public float thresholdMax;
        public string[] diagnosticIndicators;
        public bool isOutOfSpec;

        public readonly StatusLevel Status
        {
            get
            {
                if (primaryValue < thresholdMin || primaryValue > thresholdMax)
                    return StatusLevel.OutOfSpec;
                float margin = Math.Abs(primaryValue - thresholdMin) / (thresholdMax - thresholdMin);
                if (margin < 0.15f)
                    return StatusLevel.Borderline;
                return StatusLevel.InSpec;
            }
        }
    }

    public enum StatusLevel
    {
        InSpec,
        Borderline,
        OutOfSpec
    }
}
