using UnityEngine;
using UnityEngine.InputSystem;

namespace WafersPlease.Interaction
{
    public class DesktopInputAdapter : MonoBehaviour, IInputAdapter
    {
        public bool IsVRActive => false;

        public Vector2 WaferTiltDelta
        {
            get
            {
                if (Mouse.current != null && Mouse.current.leftButton.isPressed)
                    return Mouse.current.delta.ReadValue() * 0.01f;
                return Vector2.zero;
            }
        }

        public int SelectedToolIndex
        {
            get
            {
                if (Keyboard.current == null) return -1;
                if (Keyboard.current[Key.Digit1].wasPressedThisFrame) return 0;
                if (Keyboard.current[Key.Digit2].wasPressedThisFrame) return 1;
                if (Keyboard.current[Key.Digit3].wasPressedThisFrame) return 2;
                if (Keyboard.current[Key.Digit4].wasPressedThisFrame) return 3;
                return -1;
            }
        }

        public bool IsAcceptStampPressed => Keyboard.current != null && Keyboard.current[Key.Digit5].wasPressedThisFrame;
        public bool IsRejectStampPressed => Keyboard.current != null && Keyboard.current[Key.Digit6].wasPressedThisFrame;
        public bool IsReworkStampPressed => Keyboard.current != null && Keyboard.current[Key.Digit7].wasPressedThisFrame;

        public bool IsTravelerOpen => Keyboard.current != null && Keyboard.current[Key.Tab].wasPressedThisFrame;

        public bool IsGlossaryOpen => Keyboard.current != null && Keyboard.current[Key.G].wasPressedThisFrame;

        public bool IsPausePressed => Keyboard.current != null && Keyboard.current[Key.Escape].wasPressedThisFrame;
    }
}
