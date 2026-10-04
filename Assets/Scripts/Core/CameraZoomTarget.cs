using UnityEngine;

namespace WafersPlease.Core
{
    public class CameraZoomTarget : MonoBehaviour
    {
        [SerializeField] Vector3 positionOffset = new Vector3(0, 0, -0.5f);
        [SerializeField] Vector3 lookAtOffset = Vector3.zero;

        public Vector3 WorldPosition => transform.TransformPoint(positionOffset);
        public Vector3 WorldLookAt => transform.TransformPoint(lookAtOffset);
    }
}
