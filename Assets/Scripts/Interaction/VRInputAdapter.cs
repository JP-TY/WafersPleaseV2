using UnityEngine;
using Unity.XR.CoreUtils;
using UnityEngine.XR.Interaction.Toolkit;
using UnityEngine.XR.Interaction.Toolkit.Interactors;

namespace WafersPlease.Interaction
{
    public class VRInputAdapter : MonoBehaviour, IInputAdapter
    {
        public bool IsVRActive => true;

        XRRayInteractor leftRay;
        XRRayInteractor rightRay;
        XRDirectInteractor leftDirect;
        XRDirectInteractor rightDirect;

        Vector2 waferTilt;
        int selectedTool = -1;
        bool stampPressed;
        bool travelerOpen;
        bool glossaryOpen;
        bool acceptStamp;
        bool rejectStamp;
        bool reworkStamp;

        public Vector2 WaferTiltDelta => waferTilt;
        public int SelectedToolIndex => selectedTool;
        public bool IsAcceptStampPressed => acceptStamp;
        public bool IsRejectStampPressed => rejectStamp;
        public bool IsReworkStampPressed => reworkStamp;
        public bool IsTravelerOpen => travelerOpen;
        public bool IsGlossaryOpen => glossaryOpen;
        public bool IsPausePressed => false;

        void Awake()
        {
            var xrOrigin = FindAnyObjectByType<XROrigin>();
            if (xrOrigin == null) return;

            leftRay = xrOrigin.transform.GetComponentInChildren<XRRayInteractor>();
            rightRay = xrOrigin.transform.GetComponentInChildren<XRRayInteractor>();
            leftDirect = xrOrigin.transform.GetComponentInChildren<XRDirectInteractor>();
            rightDirect = xrOrigin.transform.GetComponentInChildren<XRDirectInteractor>();
        }
    }
}
