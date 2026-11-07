using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using WafersPlease.Core;
using WafersPlease.UI;

namespace WafersPlease.Interaction
{
    [RequireComponent(typeof(Interactable), typeof(CameraZoomTarget))]
    public class InspectionController : MonoBehaviour
    {
        GameFlowController flow;
        CameraController cam;
        Font font;
        Canvas canvas;

        static readonly Color Green = new Color(0.20f, 0.85f, 0.45f);
        static readonly Color Red = new Color(0.90f, 0.25f, 0.20f);
        static readonly Color Amber = new Color(1.0f, 0.70f, 0.15f);
        static readonly Color Bg = new Color(0.06f, 0.06f, 0.10f, 0.94f);

        void Awake()
        {
            flow = FindAnyObjectByType<GameFlowController>();
            cam = FindAnyObjectByType<CameraController>();
            font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            GetComponent<Interactable>().onInteract.AddListener(OnInteract);
            CameraController.OnZoomEnd += OnZoomEnd;
            CreateCanvas();
        }

        void OnDestroy()
        {
            CameraController.OnZoomEnd -= OnZoomEnd;
        }

        void OnZoomEnd()
        {
            canvas?.gameObject.SetActive(false);
        }

        void CreateCanvas()
        {
            var go = new GameObject("InspectionCanvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 110;
            var cs = go.GetComponent<CanvasScaler>();
            cs.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            cs.referenceResolution = new Vector2(1920, 1080);
            canvas.gameObject.SetActive(false);
        }

        void OnInteract()
        {
            if (flow == null || flow.CurrentWafer == null) return;
            var existing = GameObject.Find("ResultOverlay");
            if (existing != null) Destroy(existing);
            ShowStampUI();
            canvas.gameObject.SetActive(true);
            cam.ZoomTo(GetComponent<CameraZoomTarget>());
        }

        void ShowStampUI()
        {
            foreach (Transform c in canvas.transform) Destroy(c.gameObject);

            var bg = new GameObject("Bg", typeof(Image));
            bg.transform.SetParent(canvas.transform, false);
            var bi = bg.GetComponent<Image>();
            bi.color = Bg;
            bi.raycastTarget = false;
            var br = bg.GetComponent<RectTransform>();
            br.anchorMin = Vector2.zero; br.anchorMax = Vector2.one; br.sizeDelta = Vector2.zero;

            MakeText("Header", "DECISION STATION", 34, FontStyle.Bold, Amber,
                new Vector2(0.05f, 0.82f), new Vector2(0.95f, 0.95f));

            MakeText("Sub", "Select disposition for the inspected wafer:", 20, FontStyle.Normal,
                new Color(0.70f, 0.70f, 0.75f),
                new Vector2(0.10f, 0.72f), new Vector2(0.90f, 0.80f));

            string wid = flow.CurrentWafer != null
                ? flow.CurrentWafer.name.Replace("(Clone)", "").Trim()
                : "???";
            MakeText("WaferId", $"Wafer-{wid}", 18, FontStyle.Normal,
                new Color(0.45f, 0.55f, 0.65f),
                new Vector2(0.10f, 0.66f), new Vector2(0.90f, 0.72f));

            var stamps = new (string label, StampType type, Color color)[]
            {
                ("ACCEPT", StampType.Accept, Green),
                ("REJECT", StampType.Reject, Red),
                ("REWORK", StampType.Rework, Amber),
            };

            float spacing = 0.31f;
            float startX = 0.035f;
            float btnW = 0.29f;

            for (int i = 0; i < stamps.Length; i++)
            {
                var s = stamps[i];
                var go = new GameObject("Stamp_" + s.label, typeof(Image), typeof(Button));
                go.transform.SetParent(canvas.transform, false);

                var img = go.GetComponent<Image>();
                img.color = new Color(s.color.r * 0.25f, s.color.g * 0.25f, s.color.b * 0.25f, 0.80f);

                var btn = go.GetComponent<Button>();
                btn.targetGraphic = img;
                var cb = btn.colors;
                cb.normalColor = new Color(s.color.r * 0.25f, s.color.g * 0.25f, s.color.b * 0.25f, 0.80f);
                cb.highlightedColor = new Color(s.color.r * 0.50f, s.color.g * 0.50f, s.color.b * 0.50f, 0.90f);
                cb.pressedColor = Color.Lerp(s.color, Color.black, 0.40f);
                cb.selectedColor = cb.normalColor;
                btn.colors = cb;

                var rt = go.GetComponent<RectTransform>();
                rt.anchorMin = new Vector2(startX + i * spacing, 0.15f);
                rt.anchorMax = new Vector2(startX + i * spacing + btnW, 0.55f);
                rt.sizeDelta = Vector2.zero;

                var lb = new GameObject("Label", typeof(Text));
                lb.transform.SetParent(go.transform, false);
                var tx = lb.GetComponent<Text>();
                tx.font = font;
                tx.text = s.label;
                tx.fontSize = 32;
                tx.fontStyle = FontStyle.Bold;
                tx.alignment = TextAnchor.MiddleCenter;
                tx.color = s.color;
                var lr = lb.GetComponent<RectTransform>();
                lr.anchorMin = Vector2.zero; lr.anchorMax = Vector2.one; lr.sizeDelta = Vector2.zero;

                var desc = new GameObject("Desc", typeof(Text));
                desc.transform.SetParent(go.transform, false);
                var td = desc.GetComponent<Text>();
                td.font = font;
                td.text = s.type == StampType.Accept ? "Wafer passes all quality checks" :
                          s.type == StampType.Reject ? "Wafer fails, cannot be salvaged" :
                          "Wafer can be repaired via rework";
                td.fontSize = 14;
                td.alignment = TextAnchor.UpperCenter;
                td.color = new Color(0.60f, 0.60f, 0.65f);
                var dr = desc.GetComponent<RectTransform>();
                dr.anchorMin = new Vector2(0.05f, 0.05f);
                dr.anchorMax = new Vector2(0.95f, 0.25f);
                dr.sizeDelta = Vector2.zero;

                var captured = s.type;
                btn.onClick.AddListener(() => Submit(captured));
            }

            MakeText("Hint", "ESC to exit", 14, FontStyle.Normal,
                new Color(0.25f, 0.25f, 0.30f),
                new Vector2(0.40f, 0.02f), new Vector2(0.60f, 0.06f));
        }

        void Submit(StampType type)
        {
            if (flow == null || flow.CurrentWafer == null) return;

            if (type == StampType.Rework)
            {
                LaunchRework();
                return;
            }

            DoSubmit(type);
        }

        void LaunchRework()
        {
            var defects = flow.CurrentWafer != null ? flow.CurrentWafer.GetDefects() : null;
            if (defects == null || defects.Length == 0)
            {
                DoSubmit(StampType.Accept);
                return;
            }

            var d = defects[0];
            var rca = FindAnyObjectByType<ReworkRcaClean>(FindObjectsInactive.Exclude);
            var sil = FindAnyObjectByType<ReworkSilicideEtch>(FindObjectsInactive.Exclude);
            var cmp = FindAnyObjectByType<ReworkCmpCalibration>(FindObjectsInactive.Exclude);

            System.Action<bool> onDone = (ok) => DoSubmit(ok ? StampType.Accept : StampType.Reject);

            switch (d.defectType)
            {
                case DefectType.SubstrateContamination:
                    if (rca != null) rca.StartMinigame(d, onDone); else onDone(false);
                    break;
                case DefectType.SilicideBridging:
                    if (sil != null) sil.StartMinigame(d, onDone); else onDone(false);
                    break;
                // Phase A: CMP console doubles as the precision rework station for
                // non-chemical defects. Phase C reworks this into the GDD tool-drift event.
                case DefectType.BowingWarping:
                case DefectType.STIVoid:
                case DefectType.InterfaceRoughness:
                case DefectType.TungstenPlugVoid:
                    if (cmp != null) cmp.StartMinigame(d, onDone); else onDone(false);
                    break;
                default:
                    onDone(false);
                    break;
            }
        }

        void DoSubmit(StampType type)
        {
            if (flow == null || cam == null) return;
            flow.SubmitDisposition(type);

            foreach (Transform c in canvas.transform) Destroy(c.gameObject);

            // independent result overlay (not parented to inspection canvas)
            string label = type switch
            {
                StampType.Accept => "ACCEPTED",
                StampType.Reject => "REJECTED",
                _ => "REWORK"
            };
            Color color = type switch
            {
                StampType.Accept => Green,
                StampType.Reject => Red,
                _ => Amber
            };

            var resultRoot = new GameObject("ResultOverlay",
                typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var cvs = resultRoot.GetComponent<Canvas>();
            cvs.renderMode = RenderMode.ScreenSpaceOverlay;
            cvs.sortingOrder = 300;
            var cs = resultRoot.GetComponent<CanvasScaler>();
            cs.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            cs.referenceResolution = new Vector2(1920, 1080);

            var bg = new GameObject("Bg", typeof(Image));
            bg.transform.SetParent(resultRoot.transform, false);
            var bi = bg.GetComponent<Image>();
            bi.color = new Color(0, 0, 0, 0.85f);
            var br = bg.GetComponent<RectTransform>();
            br.anchorMin = Vector2.zero; br.anchorMax = Vector2.one; br.sizeDelta = Vector2.zero;

            var card = UITheme.Panel(resultRoot.transform,
                new Vector2(0.3f, 0.4f), new Vector2(0.7f, 0.6f), UITheme.PanelBgSolid);
            var accent = UITheme.Panel(card.transform,
                new Vector2(0.0f, 0.0f), new Vector2(1f, 0.06f), color);
            accent.raycastTarget = false;

            var tx = new GameObject("Result", typeof(Text));
            tx.transform.SetParent(card.transform, false);
            var txt = tx.GetComponent<Text>();
            txt.font = font;
            txt.text = $"WAFER {label}";
            txt.fontSize = 48;
            txt.fontStyle = FontStyle.Bold;
            txt.alignment = TextAnchor.MiddleCenter;
            txt.color = color;
            var tr = tx.GetComponent<RectTransform>();
            tr.anchorMin = new Vector2(0.05f, 0.1f);
            tr.anchorMax = new Vector2(0.95f, 0.95f);
            tr.sizeDelta = Vector2.zero;

            StartCoroutine(AnimateResult(card.gameObject));

            cam.ExitZoom();
            Destroy(resultRoot, 2.5f);
        }

        IEnumerator AnimateResult(GameObject textObj)
        {
            textObj.transform.localScale = Vector3.zero;
            float dur = 0.4f;
            float t = 0;
            while (t < dur)
            {
                t += Time.deltaTime;
                float p = t / dur;
                float s = p < 0.75f
                    ? Mathf.Lerp(0, 1.15f, Mathf.SmoothStep(0, 1, p / 0.75f))
                    : Mathf.Lerp(1.15f, 1f, (p - 0.75f) / 0.25f);
                textObj.transform.localScale = Vector3.one * s;
                yield return null;
            }
            textObj.transform.localScale = Vector3.one;
        }

        public void HandleStampFrom3D(StampType type)
        {
            Submit(type);
        }

        GameObject MakeText(string name, string text, int size, FontStyle fs, Color c,
            Vector2 min, Vector2 max)
        {
            if (canvas == null) return null;
            var go = new GameObject(name, typeof(Text));
            go.transform.SetParent(canvas.transform, false);
            var tx = go.GetComponent<Text>();
            tx.font = font;
            tx.text = text;
            tx.fontSize = size;
            tx.fontStyle = fs;
            tx.alignment = TextAnchor.MiddleCenter;
            tx.color = c;
            tx.raycastTarget = false;
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = min; rt.anchorMax = max;
            rt.sizeDelta = Vector2.zero;
            return go;
        }
    }
}
