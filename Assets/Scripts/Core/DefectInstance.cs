using UnityEngine;
using WafersPlease.Config;

namespace WafersPlease.Core
{
    public class DefectInstance
    {
        public DefectProfileSO profile;
        public Vector3 localPosition;
        public Vector3 baseScale;
        public GameObject visualObject;
        public bool isDetected;
        public bool isHighlighted;

        public DefectInstance(DefectProfileSO profile, Vector3 localPosition, Vector3 baseScale)
        {
            this.profile = profile;
            this.localPosition = localPosition;
            this.baseScale = baseScale;
        }
    }
}
