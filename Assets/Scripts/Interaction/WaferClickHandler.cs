using UnityEngine;
using WafersPlease.Core;

namespace WafersPlease.Interaction
{
    [RequireComponent(typeof(Interactable))]
    public class WaferClickHandler : MonoBehaviour
    {
        WaferController wafer;

        void Awake()
        {
            wafer = GetComponent<WaferController>();
            var interactable = GetComponent<Interactable>();
            interactable.onInteract.AddListener(OnClick);
        }

        void OnClick()
        {
            if (wafer == null) return;

            if (wafer.CurrentState == WaferController.WaferState.Idle)
            {
                wafer.BeginInspection();
                wafer.SetHighlight(true);
                Debug.Log("[Wafer] Inspection started.");
            }
        }
    }
}
