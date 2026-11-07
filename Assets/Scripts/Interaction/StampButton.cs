using UnityEngine;
using UnityEngine.InputSystem;
using WafersPlease.Core;

namespace WafersPlease.Interaction
{
    [RequireComponent(typeof(BoxCollider))]
    public class StampButton : MonoBehaviour
    {
        [SerializeField] StampType stampType = StampType.Accept;
        [SerializeField] Color hoverColor = new Color(0.3f, 0.8f, 1f);
        [SerializeField] Color idleColor = new Color(0.2f, 0.2f, 0.25f);

        GameFlowController flow;
        CameraController cam;
        InspectionController inspectionUI;
        Renderer rend;
        MaterialPropertyBlock mpb;
        Color originalColor;
        bool hovering;

        void Awake()
        {
            flow = FindAnyObjectByType<GameFlowController>();
            cam = FindAnyObjectByType<CameraController>();
            inspectionUI = FindAnyObjectByType<InspectionController>();
            rend = GetComponent<Renderer>();
            mpb = new MaterialPropertyBlock();

            if (rend != null)
            {
                rend.GetPropertyBlock(mpb);
                originalColor = rend.sharedMaterial != null
                    ? rend.sharedMaterial.color
                    : idleColor;
            }

            var col = GetComponent<BoxCollider>();
            col.isTrigger = true;
        }

        void Update()
        {
            if (cam == null || !cam.IsZoomedOrReturning)
            {
                if (hovering) SetHover(false);
                return;
            }

            if (Camera.main == null) return;

            Vector3 mousePos = Mouse.current != null
                ? Mouse.current.position.ReadValue()
                : Input.mousePosition;

            Ray ray = Camera.main.ScreenPointToRay(mousePos);

            bool hoverNow = Physics.Raycast(ray, out RaycastHit hitInfo, 10f)
                && hitInfo.collider == GetComponent<Collider>();

            if (hoverNow != hovering)
                SetHover(hoverNow);

            if (hoverNow && Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame
                && flow != null && flow.CurrentWafer != null
                && flow.CurrentWafer.CurrentState == WaferController.WaferState.AwaitingDisposition)
            {
                Submit();
            }
        }

        void SetHover(bool active)
        {
            hovering = active;
            if (rend == null) return;

            rend.GetPropertyBlock(mpb);
            mpb.SetColor("_BaseColor", active ? hoverColor : originalColor);
            mpb.SetColor("_Color", active ? hoverColor : originalColor);
            rend.SetPropertyBlock(mpb);
        }

        void Submit()
        {
            if (flow == null || flow.CurrentWafer == null) return;

            if (inspectionUI != null)
                inspectionUI.HandleStampFrom3D(stampType);
            else
                flow.SubmitDisposition(stampType);
        }
    }
}
