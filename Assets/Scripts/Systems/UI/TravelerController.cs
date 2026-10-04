using UnityEngine;
using UnityEngine.UI;

namespace WafersPlease.Systems.UI
{
    public class TravelerController : MonoBehaviour
    {
        public GameObject travelerPanel;

        bool isOpen;
        Text waferIdText;
        Text defectsText;
        Text statusText;

        public bool IsOpen => isOpen;

        void Awake()
        {
            if (travelerPanel == null)
                CreateFallbackUI();
            else
                CacheTextReferences();
        }

        void CacheTextReferences()
        {
            var texts = travelerPanel.GetComponentsInChildren<Text>(true);
            foreach (var t in texts)
            {
                switch (t.gameObject.name)
                {
                    case "WaferId": waferIdText = t; break;
                    case "Defects": defectsText = t; break;
                    case "Status": statusText = t; break;
                }
            }
        }

        void CreateFallbackUI()
        {
            var go = new GameObject("TravelerCanvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            go.transform.SetParent(transform);
            go.SetActive(false);

            var canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 20;

            var panel = new GameObject("TravelerPanel", typeof(Image));
            panel.transform.SetParent(go.transform, false);
            var prt = panel.GetComponent<RectTransform>();
            prt.anchorMin = new Vector2(0.5f, 0.5f);
            prt.anchorMax = new Vector2(0.5f, 0.5f);
            prt.sizeDelta = new Vector2(500, 450);
            prt.anchoredPosition = Vector2.zero;

            var bg = panel.GetComponent<Image>();
            bg.color = new Color(0.08f, 0.08f, 0.12f, 0.92f);

            var title = new GameObject("Title", typeof(Text));
            title.transform.SetParent(panel.transform, false);
            var ttl = title.GetComponent<Text>();
            ttl.text = "TRAVELER";
            ttl.fontSize = 28;
            ttl.fontStyle = FontStyle.Bold;
            ttl.alignment = TextAnchor.UpperCenter;
            ttl.color = new Color(0.9f, 0.9f, 1f);
            var ttlRt = title.GetComponent<RectTransform>();
            ttlRt.anchorMin = new Vector2(0, 1);
            ttlRt.anchorMax = new Vector2(1, 1);
            ttlRt.pivot = new Vector2(0.5f, 1);
            ttlRt.sizeDelta = new Vector2(0, 50);
            ttlRt.anchoredPosition = new Vector2(0, -10);

            var waferGo = new GameObject("WaferId", typeof(Text));
            waferGo.transform.SetParent(panel.transform, false);
            waferIdText = waferGo.GetComponent<Text>();
            waferIdText.text = "Wafer ID: ---";
            waferIdText.fontSize = 20;
            waferIdText.fontStyle = FontStyle.Bold;
            waferIdText.alignment = TextAnchor.UpperLeft;
            waferIdText.color = Color.white;
            var widRt = waferGo.GetComponent<RectTransform>();
            widRt.anchorMin = new Vector2(0, 0.7f);
            widRt.anchorMax = new Vector2(1, 0.85f);
            widRt.pivot = new Vector2(0.5f, 0.5f);
            widRt.sizeDelta = new Vector2(-40, 0);
            widRt.anchoredPosition = new Vector2(0, 0);

            var defectsGo = new GameObject("Defects", typeof(Text));
            defectsGo.transform.SetParent(panel.transform, false);
            defectsText = defectsGo.GetComponent<Text>();
            defectsText.text = "No defects detected";
            defectsText.fontSize = 16;
            defectsText.alignment = TextAnchor.UpperLeft;
            defectsText.color = new Color(0.8f, 0.8f, 0.8f);
            var defRt = defectsGo.GetComponent<RectTransform>();
            defRt.anchorMin = new Vector2(0, 0.15f);
            defRt.anchorMax = new Vector2(1, 0.65f);
            defRt.pivot = new Vector2(0.5f, 0.5f);
            defRt.sizeDelta = new Vector2(-40, 0);
            defRt.anchoredPosition = new Vector2(0, 0);

            var statusGo = new GameObject("Status", typeof(Text));
            statusGo.transform.SetParent(panel.transform, false);
            statusText = statusGo.GetComponent<Text>();
            statusText.text = "Status: ---";
            statusText.fontSize = 18;
            statusText.fontStyle = FontStyle.Bold;
            statusText.alignment = TextAnchor.LowerLeft;
            statusText.color = new Color(0.6f, 0.8f, 1f);
            var stRt = statusGo.GetComponent<RectTransform>();
            stRt.anchorMin = new Vector2(0, 0);
            stRt.anchorMax = new Vector2(1, 0.12f);
            stRt.pivot = new Vector2(0.5f, 0.5f);
            stRt.sizeDelta = new Vector2(-40, 0);
            stRt.anchoredPosition = new Vector2(0, 0);

            travelerPanel = go;
        }

        public void Open(string waferId, string[] defects, string status)
        {
            isOpen = true;
            if (travelerPanel != null)
            {
                travelerPanel.SetActive(true);
                UpdateLabels(waferId, defects, status);
            }
        }

        void UpdateLabels(string waferId, string[] defects, string status)
        {
            if (waferIdText != null)
                waferIdText.text = $"Wafer ID: {waferId}";
            if (defectsText != null)
                defectsText.text = defects.Length > 0
                    ? string.Join("\n", defects)
                    : "No defects detected";
            if (statusText != null)
                statusText.text = $"Status: {status}";
        }

        public void Close()
        {
            isOpen = false;
            if (travelerPanel != null)
                travelerPanel.SetActive(false);
        }
    }
}
