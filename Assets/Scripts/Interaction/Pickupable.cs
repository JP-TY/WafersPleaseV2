using UnityEngine;

namespace WafersPlease.Interaction
{
    [RequireComponent(typeof(Interactable))]
    public class Pickupable : MonoBehaviour
    {
        [SerializeField] Vector3 holdOffset = new Vector3(0.4f, -0.3f, 0.5f);
        [SerializeField] Vector3 holdRotation = new Vector3(0, 180, 0);

        Vector3 originalPos;
        Quaternion originalRot;
        Transform originalParent;
        bool isHeld;

        void Awake()
        {
            GetComponent<Interactable>().onInteract.AddListener(ToggleHold);
        }

        void Start()
        {
            originalPos = transform.position;
            originalRot = transform.rotation;
            originalParent = transform.parent;
        }

        public void ToggleHold()
        {
            if (isHeld)
                Drop();
            else
                Pickup();
        }

        void Pickup()
        {
            isHeld = true;
            transform.SetParent(Camera.main.transform, true);
        }

        void Drop()
        {
            isHeld = false;
            transform.SetParent(originalParent);
            transform.position = originalPos;
            transform.rotation = originalRot;
        }

        void Update()
        {
            if (!isHeld) return;

            transform.localPosition = holdOffset;
            transform.localEulerAngles = holdRotation;
        }
    }
}
