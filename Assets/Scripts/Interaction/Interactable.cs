using UnityEngine;
using UnityEngine.Events;

namespace WafersPlease.Interaction
{
    public class Interactable : MonoBehaviour
    {
        [SerializeField] string displayName = "Object";
        [SerializeField] string description = "";

        public string DisplayName => displayName;
        public string Description => description;

        public UnityEvent onInteract;

        public void Interact()
        {
            onInteract.Invoke();
        }
    }
}
