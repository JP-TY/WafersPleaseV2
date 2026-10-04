using UnityEngine;
using UnityEngine.UI;
using WafersPlease;
using WafersPlease.Core;

namespace WafersPlease.Systems.UI
{
    public class InspectionPopup : MonoBehaviour
    {
        GameFlowController flow;
        Font defaultFont;
        GameObject canvasGo;
        bool isOpen;

        void Awake()
        {
            flow = FindAnyObjectByType<GameFlowController>();
            defaultFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        }

        public void Open()
        {
            if (isOpen) return;
            if (flow == null || flow.CurrentWafer == null)
            {
                Debug.Log("[InspectionPopup] No wafer to inspect.");
                return;
            }
            isOpen = true;
            BuildUI();
        }

        public void Close()
        {
            isOpen = false;
            if (canvasGo != null)
            {
                Destroy(canvasGo);
                canvasGo = null;
            }
        }

        void BuildUI()
        {
            canvasGo = new GameObject("InspectionCanvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvasGo.transform.SetParent(transform);
            var canvas = canvasGo.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;

            var scaler = canvasGo.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);

            BuildBackground(canvas);
            BuildHeader(canvas);
            BuildDefectsPanel(canvas);
            BuildAnalysisPanel(canvas);
            BuildButtons(canvas);
        }

        void BuildBackground(Canvas canvas)
        {
            var bg = new GameObject("Background", typeof(Image));
            bg.transform.SetParent(canvas.transform, false);
            var img = bg.GetComponent<Image>();
            img.color = new Color(0.05f, 0.05f, 0.08f, 0.92f);

            var rt = bg.GetComponent<RectTransform>();
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.sizeDelta = Vector2.zero;
            rt.anchoredPosition = Vector2.zero;
        }

        void BuildHeader(Canvas canvas)
        {
            var wafer = flow.CurrentWafer;

            var hdr = new GameObject("Header", typeof(Text));
            hdr.transform.SetParent(canvas.transform, false);
            var txt = hdr.GetComponent<Text>();
            txt.font = defaultFont;
            txt.text = $"WAFER INSPECTION REPORT — Wafer-{wafer.name.Replace("(Clone)", "")}";
            txt.fontSize = 26;
            txt.fontStyle = FontStyle.Bold;
            txt.alignment = TextAnchor.MiddleCenter;
            txt.color = new Color(0.9f, 0.9f, 1f);

            var rt = hdr.GetComponent<RectTransform>();
            rt.anchorMin = new Vector2(0, 0.85f);
            rt.anchorMax = new Vector2(1, 0.95f);
            rt.sizeDelta = new Vector2(0, 0);
            rt.anchoredPosition = Vector2.zero;
        }

        void BuildDefectsPanel(Canvas canvas)
        {
            var panel = new GameObject("DefectsPanel", typeof(Image));
            panel.transform.SetParent(canvas.transform, false);
            var bg = panel.GetComponent<Image>();
            bg.color = new Color(0.1f, 0.1f, 0.14f, 0.9f);

            var prt = panel.GetComponent<RectTransform>();
            prt.anchorMin = new Vector2(0.03f, 0.08f);
            prt.anchorMax = new Vector2(0.48f, 0.78f);
            prt.sizeDelta = Vector2.zero;
            prt.anchoredPosition = Vector2.zero;

            // Title
            var title = new GameObject("DefectsTitle", typeof(Text));
            title.transform.SetParent(panel.transform, false);
            var ttl = title.GetComponent<Text>();
            ttl.font = defaultFont;
            ttl.text = "DEFECTS FOUND";
            ttl.fontSize = 18;
            ttl.fontStyle = FontStyle.Bold;
            ttl.color = new Color(1f, 0.7f, 0.3f);
            var ttlRt = title.GetComponent<RectTransform>();
            ttlRt.anchorMin = new Vector2(0, 0.9f);
            ttlRt.anchorMax = new Vector2(1, 1);
            ttlRt.sizeDelta = new Vector2(-20, -10);
            ttlRt.anchoredPosition = Vector2.zero;

            // Defect entries
            var defects = flow.CurrentWafer.GetDefects();
            string defectText = defects.Length == 0 ? "No defects detected." : "";
            foreach (var d in defects)
            {
                defectText += $"• {d.displayName}\n  Type: {d.defectType}  |  Severity: {d.severity}  |  Difficulty: {d.detectionDifficulty}\n\n";
            }

            var body = new GameObject("DefectsBody", typeof(Text));
            body.transform.SetParent(panel.transform, false);
            var bdy = body.GetComponent<Text>();
            bdy.font = defaultFont;
            bdy.text = defectText;
            bdy.fontSize = 15;
            bdy.color = new Color(0.85f, 0.85f, 0.85f);
            bdy.alignment = TextAnchor.UpperLeft;

            var bdyRt = body.GetComponent<RectTransform>();
            bdyRt.anchorMin = new Vector2(0, 0);
            bdyRt.anchorMax = new Vector2(1, 0.85f);
            bdyRt.sizeDelta = new Vector2(-20, -10);
            bdyRt.anchoredPosition = new Vector2(0, 0);
        }

        void BuildAnalysisPanel(Canvas canvas)
        {
            var panel = new GameObject("AnalysisPanel", typeof(Image));
            panel.transform.SetParent(canvas.transform, false);
            var bg = panel.GetComponent<Image>();
            bg.color = new Color(0.08f, 0.1f, 0.15f, 0.9f);

            var prt = panel.GetComponent<RectTransform>();
            prt.anchorMin = new Vector2(0.52f, 0.08f);
            prt.anchorMax = new Vector2(0.97f, 0.78f);
            prt.sizeDelta = Vector2.zero;
            prt.anchoredPosition = Vector2.zero;

            // Title
            var title = new GameObject("AnalysisTitle", typeof(Text));
            title.transform.SetParent(panel.transform, false);
            var ttl = title.GetComponent<Text>();
            ttl.font = defaultFont;
            ttl.text = "ANALYSIS";
            ttl.fontSize = 18;
            ttl.fontStyle = FontStyle.Bold;
            ttl.color = new Color(0.3f, 0.7f, 1f);
            var ttlRt = title.GetComponent<RectTransform>();
            ttlRt.anchorMin = new Vector2(0, 0.9f);
            ttlRt.anchorMax = new Vector2(1, 1);
            ttlRt.sizeDelta = new Vector2(-20, -10);
            ttlRt.anchoredPosition = Vector2.zero;

            var defects = flow.CurrentWafer.GetDefects();
            var handler = new Systems.Decision.DispositionHandler(
                GameManager.Instance.CurrentRuleMatrix);
            var result = handler.Evaluate(defects);

            string hintsText = $"Severity Assessment:\n{AnalyzeSeverity(defects)}\n\n";
            hintsText += $"Recommended Action: {result.correctAction}\n";
            hintsText += $"Confidence: {result.confidence:P0}\n\n";
            hintsText += $"Recommendation:\n{result.reasoning}";

            if (defects.Length == 0)
                hintsText = "No defects detected.\n\nRecommendation: Accept — wafer meets specifications.";

            var body = new GameObject("AnalysisBody", typeof(Text));
            body.transform.SetParent(panel.transform, false);
            var bdy = body.GetComponent<Text>();
            bdy.font = defaultFont;
            bdy.text = hintsText;
            bdy.fontSize = 15;
            bdy.color = new Color(0.85f, 0.85f, 0.85f);
            bdy.alignment = TextAnchor.UpperLeft;

            var bdyRt = body.GetComponent<RectTransform>();
            bdyRt.anchorMin = new Vector2(0, 0);
            bdyRt.anchorMax = new Vector2(1, 0.85f);
            bdyRt.sizeDelta = new Vector2(-20, -10);
            bdyRt.anchoredPosition = new Vector2(0, 0);
        }

        static string AnalyzeSeverity(Config.DefectProfileSO[] defects)
        {
            if (defects.Length == 0) return "None — wafer is clean";
            int catastrophic = 0;
            foreach (var d in defects)
                if (d.defectClass == DefectClass.Catastrophic) catastrophic++;
            if (catastrophic > 0) return $"{catastrophic} catastrophic defect(s) detected — high risk";
            return $"{defects.Length} parametric defect(s) — moderate risk";
        }

        void BuildButtons(Canvas canvas)
        {
            BuildButton(canvas, "AcceptBtn", "ACCEPT", new Color(0.15f, 0.55f, 0.15f), StampType.Accept, 0.05f);
            BuildButton(canvas, "RejectBtn", "REJECT", new Color(0.6f, 0.15f, 0.15f), StampType.Reject, 0.37f);
            BuildButton(canvas, "ReworkBtn", "REWORK", new Color(0.6f, 0.55f, 0.1f), StampType.Rework, 0.68f);
        }

        void BuildButton(Canvas canvas, string name, string text, Color color, StampType stamp, float xMin)
        {
            var go = new GameObject(name, typeof(Image), typeof(Button));
            go.transform.SetParent(canvas.transform, false);

            var img = go.GetComponent<Image>();
            img.color = color;

            var btn = go.GetComponent<Button>();
            btn.targetGraphic = img;

            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = new Vector2(xMin, 0.01f);
            rt.anchorMax = new Vector2(xMin + 0.28f, 0.05f);
            rt.sizeDelta = Vector2.zero;
            rt.anchoredPosition = Vector2.zero;

            var label = new GameObject("Label", typeof(Text));
            label.transform.SetParent(go.transform, false);
            var lbl = label.GetComponent<Text>();
            lbl.font = defaultFont;
            lbl.text = text;
            lbl.fontSize = 20;
            lbl.fontStyle = FontStyle.Bold;
            lbl.alignment = TextAnchor.MiddleCenter;
            lbl.color = Color.white;

            var lrt = label.GetComponent<RectTransform>();
            lrt.anchorMin = Vector2.zero;
            lrt.anchorMax = Vector2.one;
            lrt.sizeDelta = Vector2.zero;
            lrt.anchoredPosition = Vector2.zero;

            var stampVal = stamp;
            btn.onClick.AddListener(() => SubmitDecision(stampVal));
        }

        void SubmitDecision(StampType decision)
        {
            if (flow == null || flow.CurrentWafer == null) return;
            flow.SubmitDisposition(decision);
            Close();
        }

        void OnDestroy()
        {
            Close();
        }
    }
}
