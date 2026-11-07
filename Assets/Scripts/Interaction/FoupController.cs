using UnityEngine;
using WafersPlease.Core;

namespace WafersPlease.Interaction
{
    [RequireComponent(typeof(Interactable))]
    public class FoupController : MonoBehaviour
    {
        GameFlowController flow;

        void Awake()
        {
            flow = FindAnyObjectByType<GameFlowController>(FindObjectsInactive.Exclude);
            var interactable = GetComponent<Interactable>();
            interactable.onInteract.AddListener(RequestWafer);
        }

        public void RequestWafer()
        {
            if (flow == null || !flow.IsGameActive)
            {
                Debug.Log("[Foup] Game is not active.");
                return;
            }
            if (flow.CurrentWafer != null && flow.CurrentWafer.CurrentState != WaferController.WaferState.Disposed)
            {
                Debug.Log("[Foup] Finish inspecting current wafer first.");
                return;
            }
            flow.SpawnNextWafer();
            Debug.Log("[Foup] Wafer dispensed.");
        }
    }
}
