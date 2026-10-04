using UnityEngine;
using UnityEngine.InputSystem;

namespace WafersPlease.Interaction
{
    public class WaferDragRotator : MonoBehaviour
    {
        [SerializeField] float idleSpeed = 15f;
        [SerializeField] float dragSensitivity = 0.5f;
        [SerializeField] float interactionDistance = 4f;
        [SerializeField] LayerMask hitLayers = -1;

        Camera mainCam;
        bool rightClickDragging;

        void Start()
        {
            mainCam = Camera.main;
        }

        void Update()
        {
            if (Mouse.current == null || mainCam == null) return;

            if (Mouse.current.rightButton.isPressed)
            {
                Vector2 mousePos = Mouse.current.position.ReadValue();
                Ray ray = mainCam.ScreenPointToRay(mousePos);
                if (Physics.Raycast(ray, out RaycastHit hit, interactionDistance, hitLayers)
                    && hit.collider.gameObject == gameObject)
                {
                    rightClickDragging = true;
                    Vector2 delta = Mouse.current.delta.ReadValue();
                    transform.Rotate(Vector3.up, -delta.x * dragSensitivity, Space.World);
                    transform.Rotate(Vector3.right, delta.y * dragSensitivity * 0.6f, Space.World);
                }
            }
            else
            {
                rightClickDragging = false;
            }

            if (!rightClickDragging)
            {
                transform.Rotate(Vector3.up, idleSpeed * Time.deltaTime, Space.World);
            }
        }
    }
}
