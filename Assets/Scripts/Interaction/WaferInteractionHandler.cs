using UnityEngine;
using WafersPlease.Core;

namespace WafersPlease.Interaction
{
    [RequireComponent(typeof(Interactable), typeof(Pickupable))]
    public class WaferInteractionHandler : MonoBehaviour
    {
        void Awake()
        {
            var interactable = GetComponent<Interactable>();
            interactable.onInteract.AddListener(OnWaferClicked);
            interactable.onInteract.AddListener(GetComponent<Pickupable>().ToggleHold);
        }

        void OnWaferClicked()
        {
            var wafer = GetComponent<WaferController>();
            if (wafer != null && wafer.CurrentState == WaferController.WaferState.Idle)
                wafer.BeginInspection();
        }
    }
}
