using UnityEngine;

namespace WafersPlease.Systems.Inspection
{
    public class MicroscopeController : InspectionToolBase
    {
        public Camera scopeCamera;
        public Transform stagePosition;
        public Vector2 xLimit = new Vector2(-0.05f, 0.05f);
        public Vector2 yLimit = new Vector2(-0.05f, 0.05f);

        Vector2 stageOffset;

        void OnValidate()
        {
            toolType = InspectionToolType.Microscope;
        }

        public void MoveStage(Vector2 delta)
        {
            stageOffset += delta;
            stageOffset.x = Mathf.Clamp(stageOffset.x, xLimit.x, xLimit.y);
            stageOffset.y = Mathf.Clamp(stageOffset.y, yLimit.x, yLimit.y);

            if (stagePosition != null)
            {
                Vector3 pos = stagePosition.localPosition;
                pos.x = stageOffset.x;
                pos.y = stageOffset.y;
                stagePosition.localPosition = pos;
            }
        }

        public void ResetStage()
        {
            stageOffset = Vector2.zero;
            if (stagePosition != null)
            {
                stagePosition.localPosition = Vector3.zero;
            }
        }

        public void SetScopeCameraZoom(float zoom)
        {
            SetZoom(zoom);
            if (scopeCamera != null)
            {
                float fov = Mathf.Lerp(60f, 5f, (zoom - 1f) / (toolConfig != null ? toolConfig.maxZoom : 100f));
                scopeCamera.fieldOfView = fov;
            }
        }
    }
}
