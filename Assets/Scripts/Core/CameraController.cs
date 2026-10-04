using UnityEngine;
using UnityEngine.InputSystem;

namespace WafersPlease.Core
{
    public class CameraController : MonoBehaviour
    {
        public static System.Action OnZoomEnd;
        public static event System.Action<float> OnZoomScroll;

        [SerializeField] float moveSpeed = 4f;
        [SerializeField] float lookSpeed = 3f;
        [SerializeField] float zoomSpeed = 3f;
        [SerializeField] float scrollZoomSpeed = 0.5f;

        float pitch;
        CameraZoomTarget currentZoomTarget;
        Vector3 preZoomPos;
        Quaternion preZoomRot;
        bool isZoomed;
        bool isReturning;
        CharacterController charController;

        float zoomDistanceOffset;
        float zoomDistanceMin = -0.5f;
        float zoomDistanceMax = 1.5f;

        Light playerLight;

        Vector3 startPosition;
        Quaternion startRotation;

        void Start()
        {
            startPosition = transform.position;
            startRotation = transform.rotation;

            charController = GetComponent<CharacterController>();
            if (charController == null)
            {
                charController = gameObject.AddComponent<CharacterController>();
                charController.height = 1.7f;
                charController.radius = 0.3f;
                charController.center = new Vector3(0, -0.85f, 0);
                charController.skinWidth = 0.08f;
            }
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;

            var pl = gameObject.AddComponent<Light>();
            pl.type = LightType.Point;
            pl.color = new Color(1f, 0.95f, 0.85f);
            pl.intensity = 1.2f;
            pl.range = 6f;
            pl.shadows = LightShadows.None;
            playerLight = pl;
        }

        void Update()
        {
            if (Keyboard.current == null) return;

            if (Keyboard.current[Key.Escape].wasPressedThisFrame)
            {
                if (isZoomed)
                {
                    OnZoomEnd?.Invoke();
                    StartReturn();
                    return;
                }
                if (!isReturning)
                    ToggleCursor();
            }

            if (isZoomed)
            {
                UpdateZoom();
                return;
            }

            if (isReturning)
            {
                UpdateReturn();
                return;
            }

            if (Cursor.lockState != CursorLockMode.Locked)
                return;

            HandleLook();
            HandleMove();
        }

        void ToggleCursor()
        {
            if (Cursor.lockState == CursorLockMode.Locked)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
            else
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
        }

        public void ZoomTo(CameraZoomTarget target)
        {
            if (target == null) return;
            if (currentZoomTarget != null && currentZoomTarget != target)
                OnZoomEnd?.Invoke();
            currentZoomTarget = target;
            preZoomPos = transform.position;
            preZoomRot = transform.rotation;
            zoomDistanceOffset = 0f;
            isZoomed = true;
            isReturning = false;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }

        public void ExitZoom()
        {
            if (!isZoomed && !isReturning) return;
            OnZoomEnd?.Invoke();
            isZoomed = false;
            isReturning = true;
            currentZoomTarget = null;
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }

        public void StartReturn()
        {
            isZoomed = false;
            isReturning = true;
        }

        public bool IsZoomedOrReturning => isZoomed || isReturning;

        public void TeleportTo(Vector3 position, Quaternion rotation)
        {
            charController.enabled = false;
            transform.SetPositionAndRotation(position, rotation);
            charController.enabled = true;
            pitch = rotation.eulerAngles.x;
            if (pitch > 180) pitch -= 360;
        }

        public void ResetToStart()
        {
            TeleportTo(startPosition, startRotation);
        }

        void UpdateZoom()
        {
            if (currentZoomTarget == null)
            {
                isZoomed = false;
                return;
            }

            if (Mouse.current != null)
            {
                float scroll = Mouse.current.scroll.ReadValue().y;
                if (Mathf.Abs(scroll) > 0.01f)
                {
                    zoomDistanceOffset = Mathf.Clamp(
                        zoomDistanceOffset - scroll * scrollZoomSpeed * 0.001f,
                        zoomDistanceMin, zoomDistanceMax);
                    OnZoomScroll?.Invoke(zoomDistanceOffset);
                }
            }

            var basePos = currentZoomTarget.WorldPosition;
            var targetLook = currentZoomTarget.WorldLookAt;
            var dir = (targetLook - basePos).normalized;

            var targetPos = basePos + dir * zoomDistanceOffset;
            var targetRot = Quaternion.LookRotation(targetLook - targetPos);

            transform.position = Vector3.Lerp(transform.position, targetPos, zoomSpeed * Time.deltaTime);
            transform.rotation = Quaternion.Slerp(transform.rotation, targetRot, zoomSpeed * Time.deltaTime);

            pitch = transform.localEulerAngles.x;
            if (pitch > 180) pitch -= 360;
        }

        void UpdateReturn()
        {
            transform.position = Vector3.Lerp(transform.position, preZoomPos, zoomSpeed * Time.deltaTime);
            transform.rotation = Quaternion.Slerp(transform.rotation, preZoomRot, zoomSpeed * Time.deltaTime);

            if (Vector3.Distance(transform.position, preZoomPos) < 0.01f)
            {
                transform.position = preZoomPos;
                transform.rotation = preZoomRot;
                isReturning = false;
                currentZoomTarget = null;
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
        }

        void HandleLook()
        {
            if (Mouse.current == null) return;

            Vector2 delta = Mouse.current.delta.ReadValue() * lookSpeed * 0.01f;

            pitch -= delta.y;
            pitch = Mathf.Clamp(pitch, -89f, 89f);

            transform.localRotation = Quaternion.Euler(pitch, transform.localEulerAngles.y + delta.x, 0f);
        }

        void HandleMove()
        {
            Vector2 moveDir = Vector2.zero;
            if (Keyboard.current[Key.W].isPressed) moveDir.y = 1f;
            if (Keyboard.current[Key.S].isPressed) moveDir.y = -1f;
            if (Keyboard.current[Key.A].isPressed) moveDir.x = -1f;
            if (Keyboard.current[Key.D].isPressed) moveDir.x = 1f;

            if (moveDir == Vector2.zero) return;

            Vector3 forward = transform.forward;
            forward.y = 0f;
            forward.Normalize();

            Vector3 right = transform.right;
            right.y = 0f;
            right.Normalize();

            Vector3 move = (forward * moveDir.y + right * moveDir.x) * (moveSpeed * Time.deltaTime);
            charController.Move(move);
        }
    }
}
