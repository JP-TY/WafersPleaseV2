using UnityEngine;

namespace WafersPlease.Config
{
    [CreateAssetMenu(fileName = "NewToolConfig", menuName = "Wafers/Tool Config")]
    public class ToolConfigSO : ScriptableObject
    {
        public ToolType toolType;
        [Range(0f, 1f)]
        public float accuracy;
        public float maxZoom;
        public string description;
        public string measurementUnit;
    }
}
