using UnityEngine;
using UnityEngine.UI;
using UnityEngine.InputSystem;
using WafersPlease.Core;

namespace WafersPlease.Interaction
{
    public class InteractionUI : MonoBehaviour
    {
        [SerializeField] Camera targetCamera;
        [SerializeField] float maxDistance = 6f;
        [SerializeField] LayerMask hitLayers = ~0;

        Text label;
        Text guidance;
        Image crosshair;
        Interactable currentTarget;
        GameFlowController flow;
        Font defaultFont;
        RectTransform crosshairRt;
        float crosshairPulse;
        float clickFlash;

        void Start()
        {
            if (targetCamera == null)
                targetCamera = Camera.main;

            flow = FindAnyObjectByType<GameFlowController>();
            defaultFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

            // Crosshair (center dot)
            var chGo = new GameObject("Crosshair", typeof(Image));
            chGo.transform.SetParent(transform, false);
            crosshair = chGo.GetComponent<Image>();
            crosshair.sprite = CreateWhiteSprite();
            crosshair.color = new Color(1, 1, 1, 0.7f);
            crosshair.raycastTarget = false;

            crosshairRt = crosshair.GetComponent<RectTransform>();
            crosshairRt.anchorMin = new Vector2(0.5f, 0.5f);
            crosshairRt.anchorMax = new Vector2(0.5f, 0.5f);
            crosshairRt.pivot = new Vector2(0.5f, 0.5f);
            crosshairRt.anchoredPosition = Vector2.zero;
            crosshairRt.sizeDelta = new Vector2(10, 10);

            // Interaction label
            var go = new GameObject("InteractLabel", typeof(Text));
            go.transform.SetParent(transform, false);
            label = go.GetComponent<Text>();
            label.font = defaultFont;
            label.alignment = TextAnchor.MiddleCenter;
            label.fontSize = 20;
            label.fontStyle = FontStyle.Bold;
            label.color = Color.white;
            label.text = "";

            var rt = label.GetComponent<RectTransform>();
            rt.anchorMin = new Vector2(0.5f, 0.5f);
            rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = new Vector2(0, -55);
            rt.sizeDelta = new Vector2(700, 60);

            // Guidance text (bottom of screen)
            var gg = new GameObject("Guidance", typeof(Text));
            gg.transform.SetParent(transform, false);
            guidance = gg.GetComponent<Text>();
            guidance.font = defaultFont;
            guidance.alignment = TextAnchor.LowerCenter;
            guidance.fontSize = 17;
            guidance.color = new Color(0.7f, 0.7f, 0.7f);
            guidance.text = "";

            var grt = guidance.GetComponent<RectTransform>();
            grt.anchorMin = new Vector2(0.5f, 0);
            grt.anchorMax = new Vector2(0.5f, 0);
            grt.pivot = new Vector2(0.5f, 0);
            grt.anchoredPosition = new Vector2(0, 45);
            grt.sizeDelta = new Vector2(800, 40);
        }

        Sprite CreateWhiteSprite()
        {
            var tex = new Texture2D(4, 4, TextureFormat.RGBA32, false);
            for (int x = 0; x < 4; x++)
                for (int y = 0; y < 4; y++)
                    tex.SetPixel(x, y, Color.white);
            tex.Apply();
            tex.hideFlags = HideFlags.DontSave;
            return Sprite.Create(tex, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f), 4);
        }

        void Update()
        {
            if (targetCamera == null) return;

            var camCtrl = targetCamera.GetComponent<CameraController>();
            if (camCtrl != null && camCtrl.IsZoomedOrReturning)
            {
                if (currentTarget != null)
                {
                    currentTarget = null;
                    label.text = "";
                }
                crosshairRt.sizeDelta = new Vector2(10, 10);
                crosshair.color = new Color(1, 1, 1, 0.5f);
                return;
            }

            UpdateGuidance();

            Ray ray = new Ray(targetCamera.transform.position, targetCamera.transform.forward);
            var hits = Physics.RaycastAll(ray, maxDistance, hitLayers);
            Interactable closest = null;
            float closestDist = float.MaxValue;
            bool clicked = Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame;

            foreach (var h in hits)
            {
                var interactable = h.collider.GetComponentInParent<Interactable>();
                if (interactable != null && h.distance < closestDist)
                {
                    closest = interactable;
                    closestDist = h.distance;
                }
            }

            bool hasTarget = closest != null;
            crosshairPulse += Time.deltaTime * (hasTarget ? 2.5f : 0.8f);

            if (clickFlash > 0)
            {
                clickFlash -= Time.deltaTime * 4f;
                crosshair.color = new Color(0.3f, 0.8f, 1f, Mathf.Lerp(0.3f, 1f, clickFlash));
                float flashSize = 14 + (1f - clickFlash) * 8f;
                crosshairRt.sizeDelta = new Vector2(flashSize, flashSize);
            }
            else
            {
                float pulse = hasTarget ? Mathf.Sin(crosshairPulse) * 0.3f + 0.7f : 0f;
                float size = hasTarget ? 10 + pulse * 4 : 10;
                float alpha = hasTarget ? 0.6f + pulse * 0.3f : 0.5f;
                crosshairRt.sizeDelta = new Vector2(size, size);
                crosshair.color = new Color(hasTarget ? 0.3f : 1f, 1f, 1f, alpha);
            }

            if (hasTarget)
            {
                if (closest != currentTarget)
                {
                    currentTarget = closest;
                    label.text = string.IsNullOrEmpty(closest.Description)
                        ? closest.DisplayName
                        : $"{closest.DisplayName} — {closest.Description}";
                }

                if (clicked)
                {
                    clickFlash = 1f;
                    currentTarget.Interact();
                }
                return;
            }

            if (currentTarget != null)
            {
                currentTarget = null;
                label.text = "";
            }
        }

        void UpdateGuidance()
        {
            string msg;
            if (flow == null)
                msg = "Loading...";
            else if (!flow.IsGameActive)
                msg = "Press SPACE to begin";
            else if (flow.CurrentWafer == null)
                msg = "Click the FOUP to get a wafer";
            else if (flow.CurrentWafer.CurrentState == WaferController.WaferState.Disposed)
                msg = "Click the FOUP for next wafer";
            else
                msg = "Click the Console to review  |  Esc to exit zoom";

            if (guidance.text != msg)
                guidance.text = msg;
        }
    }
}
