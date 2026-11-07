using UnityEngine;
using UnityEngine.InputSystem;

namespace WafersPlease.Core
{
    public class HitboxDebug : MonoBehaviour
    {
        [SerializeField] Color gizmoColor = new Color(0, 1, 0, 0.4f);
        [SerializeField] Color hitColor = new Color(1, 0, 0, 0.6f);
        [SerializeField] float maxRayDistance = 3f;

        bool showHitboxes = true;

        void Update()
        {
            if (Keyboard.current != null && Keyboard.current[Key.F3].wasPressedThisFrame)
                showHitboxes = !showHitboxes;
        }

        void OnDrawGizmos()
        {
            if (!showHitboxes) return;

            var cam = Camera.main;
            if (cam != null)
            {
                Ray ray = new Ray(cam.transform.position, cam.transform.forward);
                Gizmos.color = Color.yellow;
                Gizmos.DrawLine(ray.origin, ray.origin + ray.direction * maxRayDistance);

                if (Physics.Raycast(ray, out RaycastHit hit, maxRayDistance, ~0, QueryTriggerInteraction.Ignore))
                {
                    Gizmos.color = hitColor;
                    Gizmos.DrawSphere(hit.point, 0.05f);
                    Gizmos.DrawLine(ray.origin, hit.point);
                }
            }

            Gizmos.color = gizmoColor;
            var colliders = FindObjectsByType<Collider>(FindObjectsInactive.Exclude);
            foreach (var col in colliders)
            {
                if (col is BoxCollider box)
                {
                    Gizmos.matrix = box.transform.localToWorldMatrix;
                    Gizmos.DrawWireCube(box.center, box.size);
                    Gizmos.matrix = Matrix4x4.identity;
                }
                else if (col is SphereCollider sphere)
                {
                    Gizmos.matrix = sphere.transform.localToWorldMatrix;
                    Gizmos.DrawWireSphere(sphere.center, sphere.radius);
                    Gizmos.matrix = Matrix4x4.identity;
                }
            }
        }
    }
}
