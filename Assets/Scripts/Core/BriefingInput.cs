using UnityEngine;
using UnityEngine.InputSystem;

namespace WafersPlease.Core
{
    public class BriefingInput : MonoBehaviour
    {
        public System.Action onDismiss;
        bool dismissed;

        void Update()
        {
            if (dismissed) return;

            if (Keyboard.current != null && Keyboard.current.spaceKey.wasPressedThisFrame)
            {
                dismissed = true;
                onDismiss?.Invoke();
                return;
            }

            if (Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame)
            {
                dismissed = true;
                onDismiss?.Invoke();
            }
        }
    }
}
