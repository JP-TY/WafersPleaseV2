using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;
using WafersPlease.Config;
using WafersPlease.Core;
using WafersPlease.Systems.Wafers;
using WafersPlease.UI;

namespace WafersPlease.Interaction
{
    [RequireComponent(typeof(Interactable), typeof(CameraZoomTarget))]
    public class ConsoleController : MonoBehaviour
    {
        GameFlowController flow;
        CameraController cam;
        public WaferSpawner waferSpawner;
        Font font;
        Canvas canvas;
        GameObject header;
        GameObject instrLabel;
        RawImage instrDisplay;
        GameObject defectLog;
        GameObject sidePanel;
        GameObject toolGroup;
        GameObject wafer3D;
        GameObject waferLight;
        GameObject waferFill;
        GameObject waferRim;
        float waferZoom = 1f;  // current zoom factor for inspection wafer
        const float baseWaferScale = 0.9f; // base display size of the console wafer
        GameObject statusBar;
        int activeToolIndex = -1;
        Coroutine currentScanRoutine;

        static readonly string[] ToolNames =
        {
            "Stylus Profilometer",
            "Spectroscopic Ellipsometry",
            "X-Ray Refractometry",
            "Electron Microscope",
            "Four-Point Probe"
        };

        static readonly Color Bg = new Color(0.06f, 0.06f, 0.10f, 0.94f);
        static readonly Color Green = new Color(0.20f, 0.85f, 0.45f);
        static readonly Color GreenDim = new Color(0.10f, 0.40f, 0.25f);
        static readonly Color Cyan = new Color(0.20f, 0.70f, 0.90f);
        static readonly Color Amber = new Color(1.0f, 0.70f, 0.15f);
        static readonly Color Red = new Color(0.90f, 0.25f, 0.20f);

        void Awake()
        {
            flow = FindAnyObjectByType<GameFlowController>(FindObjectsInactive.Exclude);
            cam = FindAnyObjectByType<CameraController>(FindObjectsInactive.Exclude);
            font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            GetComponent<Interactable>().onInteract.AddListener(Open);
            CameraController.OnZoomEnd += OnZoomEnd;
        }

        void Start()
        {
            if (waferSpawner == null)
                waferSpawner = FindAnyObjectByType<WaferSpawner>(FindObjectsInactive.Exclude);
        }

        void OnDestroy()
        {
            CameraController.OnZoomEnd -= OnZoomEnd;
        }

        void Open()
        {
            if (flow == null || flow.CurrentWafer == null) return;
            activeToolIndex = -1;
            waferZoom = 1f;
            BuildUI();
            ShowInspectionUI();
            BuildWafer();
            canvas.gameObject.SetActive(true);
            cam.ZoomTo(GetComponent<CameraZoomTarget>());
        }

        void Close()
        {
            if (flow != null && flow.CurrentWafer != null
                && flow.CurrentWafer.CurrentState == WaferController.WaferState.UnderInspection)
            {
                flow.CurrentWafer.SetState(WaferController.WaferState.AwaitingDisposition);
            }
            ClearDynamic();
            canvas.gameObject.SetActive(false);
        }

        void OnZoomEnd() { Close(); }

public void ForceClose()
        {
            if (canvas == null || !canvas.gameObject.activeSelf) return;
            Close();
        }


        void BuildUI()
        {
            if (canvas != null) return;

            var go = new GameObject("ConsoleCanvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;
            var cs = go.GetComponent<CanvasScaler>();
            cs.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            cs.referenceResolution = new Vector2(1920, 1080);

            var bg = new GameObject("Bg", typeof(Image));
            bg.transform.SetParent(canvas.transform, false);
            var bi = bg.GetComponent<Image>();
            bi.color = Bg;
            bi.raycastTarget = false;
            var br = bg.GetComponent<RectTransform>();
            br.anchorMin = Vector2.zero; br.anchorMax = Vector2.one; br.sizeDelta = Vector2.zero;

            var scanGO = new GameObject("ScanLines", typeof(RawImage));
            scanGO.transform.SetParent(canvas.transform, false);
            var si = scanGO.GetComponent<RawImage>();
            si.texture = GenerateScanLines(2, 512);
            si.color = new Color(1, 1, 1, 0.08f);
            si.raycastTarget = false;
            var sr = scanGO.GetComponent<RectTransform>();
            sr.anchorMin = Vector2.zero; sr.anchorMax = Vector2.one; sr.sizeDelta = Vector2.zero;

            canvas.gameObject.SetActive(false);
        }

        void ShowInspectionUI()
        {
            ClearDynamic();

            string wid = flow.CurrentWafer != null
                ? flow.CurrentWafer.name.Replace("(Clone)", "").Trim()
                : "???";

            header = MakeText("HEADER",
                $"WAFER INSPECTION  \u2014  Wafer-{wid}", 30, FontStyle.Bold, Cyan,
                new Vector2(0.04f, 0.90f), new Vector2(0.96f, 0.98f));

            sidePanel = new GameObject("SidePanel", typeof(Image));
            sidePanel.transform.SetParent(canvas.transform, false);
            var sp = sidePanel.GetComponent<Image>();
            sp.color = new Color(0.08f, 0.08f, 0.12f, 0.85f);
            var sr = sidePanel.GetComponent<RectTransform>();
            sr.anchorMin = new Vector2(0.01f, 0.08f);
            sr.anchorMax = new Vector2(0.22f, 0.84f);
            sr.sizeDelta = Vector2.zero;

            MakeText("PanelLabel", "METROLOGY TOOLS", 16, FontStyle.Bold, Green,
                new Vector2(0.01f, 0.845f), new Vector2(0.22f, 0.88f));

            BuildToolButtons();

            var rp = new GameObject("RightPanel", typeof(Image));
            rp.transform.SetParent(canvas.transform, false);
            var ri = rp.GetComponent<Image>();
            ri.color = new Color(0.08f, 0.08f, 0.12f, 0.85f);
            var rr = rp.GetComponent<RectTransform>();
            rr.anchorMin = new Vector2(0.76f, 0.08f);
            rr.anchorMax = new Vector2(0.99f, 0.84f);
            rr.sizeDelta = Vector2.zero;

            MakeText("InstrTitle", "INSTRUMENT READOUT", 16, FontStyle.Bold, Green,
                new Vector2(0.76f, 0.845f), new Vector2(0.99f, 0.88f));

            instrDisplay = null;
            instrLabel = null;

            defectLog = new GameObject("DefectLog", typeof(Text));
            defectLog.transform.SetParent(canvas.transform, false);
            var dt = defectLog.GetComponent<Text>();
            dt.font = font;
            dt.text = "Select a tool to scan the wafer.";
            dt.fontSize = 15;
            dt.fontStyle = FontStyle.Normal;
            dt.alignment = TextAnchor.UpperLeft;
            dt.color = new Color(0.55f, 0.55f, 0.60f);
            dt.raycastTarget = false;
            var dr = defectLog.GetComponent<RectTransform>();
            dr.anchorMin = new Vector2(0.24f, 0.06f);
            dr.anchorMax = new Vector2(0.74f, 0.78f);
            dr.sizeDelta = Vector2.zero;

            statusBar = new GameObject("StatusBar", typeof(Image));
            statusBar.transform.SetParent(canvas.transform, false);
            var sb = statusBar.GetComponent<Image>();
            sb.color = new Color(0.04f, 0.04f, 0.06f, 0.90f);
            var sbr = statusBar.GetComponent<RectTransform>();
            sbr.anchorMin = new Vector2(0, 0);
            sbr.anchorMax = new Vector2(1, 0.055f);
            sbr.sizeDelta = Vector2.zero;

            MakeText("StatusText",
                "Drag wafer to rotate  |  Scroll to zoom  |  ESC to exit",
                14, FontStyle.Normal, GreenDim,
                new Vector2(0.02f, 0), new Vector2(0.98f, 0.055f));
        }

        void BuildToolButtons()
        {
            toolGroup = new GameObject("ToolGroup", typeof(RectTransform));
            toolGroup.transform.SetParent(sidePanel.transform, false);
            var tg = toolGroup.GetComponent<RectTransform>();
            tg.anchorMin = new Vector2(0, 0);
            tg.anchorMax = new Vector2(1, 0.92f);
            tg.sizeDelta = Vector2.zero;
            tg.offsetMin = new Vector2(4, 4);
            tg.offsetMax = new Vector2(-4, -4);

            int n = ToolNames.Length;
            float h = 1f / n;

            var allowed = GameManager.Instance?.CurrentDayConfig?.availableTools;

            for (int i = 0; i < n; i++)
            {
                var idx = i;
                bool toolEnabled = allowed == null || allowed.Length == 0
                    || System.Array.IndexOf(allowed, (ToolType)i) >= 0;
                var go = new GameObject("Tool_" + i, typeof(Image), typeof(Button));
                go.transform.SetParent(toolGroup.transform, false);

                var img = go.GetComponent<Image>();
                img.color = new Color(0.10f, 0.15f, 0.20f);

                var btn = go.GetComponent<Button>();
                btn.targetGraphic = img;
                btn.interactable = toolEnabled;
                var cb = btn.colors;
                cb.normalColor = new Color(0.10f, 0.15f, 0.20f);
                cb.highlightedColor = new Color(0.15f, 0.30f, 0.25f);
                cb.pressedColor = new Color(0.05f, 0.10f, 0.12f);
                cb.selectedColor = new Color(0.10f, 0.15f, 0.20f);
                cb.disabledColor = new Color(0.05f, 0.05f, 0.07f);
                btn.colors = cb;
                if (!toolEnabled)
                    img.color = new Color(0.05f, 0.05f, 0.07f);

                var rt = go.GetComponent<RectTransform>();
                rt.anchorMin = new Vector2(0, 1f - (i + 1) * h + 0.02f);
                rt.anchorMax = new Vector2(1, 1f - i * h - 0.02f);
                rt.sizeDelta = Vector2.zero;

                var lb = new GameObject("Label", typeof(Text));
                lb.transform.SetParent(go.transform, false);
                var tx = lb.GetComponent<Text>();
                tx.font = font;
                tx.text = toolEnabled ? $"{i + 1}. {ToolNames[i]}" : $"{i + 1}. {ToolNames[i]} [LOCKED]";
                tx.fontSize = 14;
                tx.fontStyle = FontStyle.Bold;
                tx.alignment = TextAnchor.MiddleLeft;
                tx.color = toolEnabled
                    ? new Color(0.70f, 0.80f, 0.90f)
                    : new Color(0.30f, 0.32f, 0.35f);
                var lr = lb.GetComponent<RectTransform>();
                lr.anchorMin = Vector2.zero; lr.anchorMax = Vector2.one;
                lr.sizeDelta = new Vector2(-10, 0);
                lr.anchoredPosition = new Vector2(10, 0);

                btn.onClick.AddListener(() => Scan(idx));
            }
        }

        void Scan(int toolIndex)
        {
            if (flow == null || flow.CurrentWafer == null) return;

            activeToolIndex = toolIndex;
            flow.CurrentWafer.SetState(WaferController.WaferState.AwaitingDisposition);

            if (toolGroup != null)
            {
                var imgs = toolGroup.GetComponentsInChildren<Image>(true);
                for (int i = 0; i < imgs.Length; i++)
                {
                    if (imgs[i].GetComponentInChildren<Text>() != null)
                        imgs[i].color = i == toolIndex
                            ? new Color(0.15f, 0.35f, 0.30f)
                            : new Color(0.10f, 0.15f, 0.20f);
                }
            }

            var toolType = (ToolType)toolIndex;
            var newlyDetected = flow.CurrentWafer.DetectForTool(toolType);
            var allToolInstances = flow.CurrentWafer.GetDetectedInstances(toolType);

            // GDD Section 12: fire context prompt for newly detected defects
            if (flow.Scaffolding != null && newlyDetected.Count > 0)
            {
                foreach (var di in newlyDetected)
                    flow.Scaffolding.OnDefectDetected(di.profile);
            }

            ShowInstrPanel(toolIndex, allToolInstances.ToArray());

            if (currentScanRoutine != null) StopCoroutine(currentScanRoutine);
            currentScanRoutine = StartCoroutine(AnimateScan(toolIndex, toolType, newlyDetected, allToolInstances));
        }

        IEnumerator AnimateScan(int toolIdx, ToolType toolType,
            List<DefectInstance> newlyDetected, List<DefectInstance> allToolInstances)
        {
            // Show results immediately (no scan beam animation).
            ShowDefectLog(toolIdx, allToolInstances);

            if (newlyDetected.Count > 0)
                yield return StartCoroutine(AnimateDefectHighlight(newlyDetected));

            currentScanRoutine = null;
        }

        IEnumerator AnimateDefectHighlight(List<DefectInstance> instances)
        {
            // Capture each marker's compensated console-scale so the pulse animation
            // grows relative to it instead of resetting to the (squashed) base scale.
            var baseScales = new Dictionary<GameObject, Vector3>();
            foreach (var di in instances)
                if (di.visualObject != null)
                    baseScales[di.visualObject] = di.visualObject.transform.localScale;

            float dur = 0.35f;
            float t = 0;
            while (t < dur)
            {
                t += Time.deltaTime;
                float p = Mathf.SmoothStep(0, 1, t / dur);
                foreach (var di in instances)
                {
                    if (di.visualObject == null) continue;
                    var r = di.visualObject.GetComponent<Renderer>();
                    if (r == null) continue;
                    r.material.EnableKeyword("_EMISSION");
                    r.material.SetColor("_EmissionColor", new Color(0, 0.8f * p, 0.4f * p));
                    float s = 1f + p * 0.15f;
                    if (baseScales.TryGetValue(di.visualObject, out var bs))
                        di.visualObject.transform.localScale = bs * s;
                }
                yield return null;
            }

            foreach (var di in instances)
            {
                if (di.visualObject == null) continue;
                var r = di.visualObject.GetComponent<Renderer>();
                if (r == null) continue;
                r.material.EnableKeyword("_EMISSION");
                r.material.SetColor("_EmissionColor", new Color(0, 0.8f, 0.4f));
                r.material.color = Color.Lerp(r.material.color, Color.white, 0.3f);
                if (baseScales.TryGetValue(di.visualObject, out var bs))
                    di.visualObject.transform.localScale = bs * 1.15f;
                di.isHighlighted = true;
            }
        }

        void ShowDefectLog(int toolIndex, List<DefectInstance> instances)
        {
            string log;
            if (instances.Count == 0)
            {
                log = $"<color=#{ColorToHex(Cyan)}>[ {ToolNames[toolIndex]} ]</color>\n\n" +
                      $"Wafer appears clean. No defects detected.";
            }
            else
            {
                log = $"<color=#{ColorToHex(Cyan)}>[ {ToolNames[toolIndex]} ]</color>\n\n" +
                      $"<color=#{ColorToHex(Amber)}>Defects found: {instances.Count}</color>\n\n";
                for (int i = 0; i < instances.Count; i++)
                {
                    var d = instances[i].profile;
                    Color c = d.defectType switch
                    {
                        DefectType.BowingWarping => new Color(0.80f, 0.85f, 0.90f),
                        DefectType.STIVoid => new Color(0.55f, 0.55f, 0.65f),
                        DefectType.InterfaceRoughness => new Color(0.60f, 0.40f, 0.80f),
                        DefectType.TungstenPlugVoid => Red,
                        DefectType.SilicideBridging => Amber,
                        DefectType.SubstrateContamination => new Color(0.90f, 0.45f, 0.45f),
                        _ => Color.white
                    };
                    string label = d.displayName ?? d.name;
                    log += $"<color=#{ColorToHex(c)}>\u25cf {label}</color>\n" +
                           $"   Type: {d.defectType}  Severity: {d.severity:F1}\n\n";
                }
                log += $"<color=#{ColorToHex(GreenDim)}>Inspection complete. Stamp at Inspection Station.</color>";
            }

            if (defectLog != null)
            {
                var dt = defectLog.GetComponent<Text>();
                dt.text = log;
                dt.fontSize = 14;
                dt.alignment = TextAnchor.UpperLeft;
                dt.color = Color.white;
            }
        }

        void ShowInstrPanel(int toolIndex, DefectInstance[] toolInstances)
        {
            if (instrDisplay != null) { Destroy(instrDisplay.gameObject); instrDisplay = null; }
            if (instrLabel != null) { Destroy(instrLabel); instrLabel = null; }

            var toolType = (ToolType)toolIndex;

            var ig = new GameObject("InstrumentDisplay", typeof(RawImage));
            ig.transform.SetParent(canvas.transform, false);
            instrDisplay = ig.GetComponent<RawImage>();
            instrDisplay.texture = InstrumentPanel.GenerateReadout(toolType, toolInstances, 512, 320);
            instrDisplay.color = Color.white;
            var ir = ig.GetComponent<RectTransform>();
            ir.anchorMin = new Vector2(0.77f, 0.38f);
            ir.anchorMax = new Vector2(0.98f, 0.76f);
            ir.sizeDelta = Vector2.zero;

            instrLabel = MakeText("InstrLabel",
                ToolNames[toolIndex], 14, FontStyle.Bold, Cyan,
                new Vector2(0.77f, 0.79f), new Vector2(0.98f, 0.84f));
        }

void BuildWafer()
        {
            // Use the original wafer prefab asset (real mesh + WaferSilicon material)
            if (waferSpawner != null && waferSpawner.waferPrefab != null)
            {
                // Instantiate inactive first so the prefab's gameplay scripts
                // (WaferController, WaferDragRotator, click handlers) never run their
                // Awake/Update — we strip them, then reactivate as a pure display mesh.
                wafer3D = Instantiate(waferSpawner.waferPrefab);
                wafer3D.SetActive(false);
                wafer3D.name = "ConsoleDigitalWafer";
                // Strip colliders first, then scripts in dependency order
                // (WaferClickHandler requires Interactable, so destroy it LAST).
                foreach (var col in wafer3D.GetComponentsInChildren<Collider>(true))
                    Destroy(col);
                foreach (var mb in wafer3D.GetComponentsInChildren<MonoBehaviour>(true))
                {
                    if (mb is Interactable) continue; // defer
                    Destroy(mb);
                }
                foreach (var ia in wafer3D.GetComponentsInChildren<Interactable>(true))
                    Destroy(ia);
                wafer3D.SetActive(true);
            }
            else
            {
                // Fallback: procedural cylinder if prefab is missing.
                wafer3D = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                wafer3D.name = "ConsoleDigitalWafer";
                var cl = wafer3D.GetComponent<Collider>();
                if (cl != null) Destroy(cl);
            }

            var zt = GetComponent<CameraZoomTarget>();
            Vector3 dirToCam = Vector3.up;
            Vector3 camLookAt;
            Vector3 camPos;
            if (zt != null)
            {
                camLookAt = zt.WorldLookAt;
                camPos = zt.WorldPosition;
                dirToCam = (camPos - camLookAt).normalized;
                // Bring the wafer close to the camera and tilt it only slightly so the
                // polished face is turned toward the viewer (catches the key light).
                wafer3D.transform.position = camLookAt + dirToCam * 0.22f + Vector3.up * 0.01f;
                wafer3D.transform.rotation = Quaternion.FromToRotation(Vector3.up, dirToCam)
                    * Quaternion.Euler(14f, 0f, 0f);
            }
            else
            {
                camLookAt = wafer3D.transform.position;
                camPos = camLookAt + Vector3.up;
            }
            // Bigger base display size for readability.
            wafer3D.transform.localScale = Vector3.one * baseWaferScale;

            Vector3 waferPos = wafer3D.transform.position;

            // --- 3-point lighting tuned for a bright, clean polished silicon look ---
            // KEY: bright warm-white spot slightly above/right, close to camera axis so
            // the reflective top face lights up instead of going dark.
            waferLight = new GameObject("ConsoleWaferLight");
            var lt = waferLight.AddComponent<Light>();
            lt.type = LightType.Spot;
            lt.color = new Color(1.0f, 0.98f, 0.94f);
            lt.intensity = 12f;
            lt.range = 6f;
            lt.spotAngle = 55f;
            Vector3 keyDir = (dirToCam * 0.7f + Vector3.up * 0.45f + Vector3.right * 0.25f).normalized;
            waferLight.transform.position = waferPos + keyDir * 0.35f;
            waferLight.transform.LookAt(waferPos);

            // FILL: soft cool point light to lift the shadow side.
            waferFill = new GameObject("ConsoleWaferFill");
            var fl = waferFill.AddComponent<Light>();
            fl.type = LightType.Point;
            fl.color = new Color(0.65f, 0.75f, 1.0f);
            fl.intensity = 4f;
            fl.range = 4f;
            Vector3 fillDir = (dirToCam * 0.4f - Vector3.right * 0.5f - Vector3.up * 0.1f).normalized;
            waferFill.transform.position = waferPos + fillDir * 0.35f;

            // RIM: cool spot from behind/above for a bright edge highlight.
            waferRim = new GameObject("ConsoleWaferRim");
            var rl = waferRim.AddComponent<Light>();
            rl.type = LightType.Spot;
            rl.color = new Color(0.6f, 0.78f, 1.0f);
            rl.intensity = 8f;
            rl.range = 5f;
            rl.spotAngle = 50f;
            Vector3 rimDir = (-dirToCam * 0.5f + Vector3.up * 0.7f).normalized;
            waferRim.transform.position = waferPos + rimDir * 0.4f;
            waferRim.transform.LookAt(waferPos);

            EmbedDefectVisuals();
        }

        static Texture2D GenerateDieGridTexture(int res)
        {
            var tex = new Texture2D(res * 2, res * 2, TextureFormat.RGBA32, true);
            // Realistic silicon surface: silver-grey dies with faint darker scribe lines,
            // giving a subtle patterned reflectance instead of a flat blueprint blue.
            Color wafer = new Color(0.58f, 0.62f, 0.68f, 1);
            Color gridLine = new Color(0.42f, 0.45f, 0.50f, 0.35f);
            Color notch = new Color(0.30f, 0.32f, 0.36f, 1);
            int diePixels = 16;
            int lineWidth = 2;
            for (int y = 0; y < tex.height; y++)
            {
                for (int x = 0; x < tex.width; x++)
                {
                    float dx = (float)x / tex.width - 0.5f;
                    float dy = (float)y / tex.height - 0.5f;
                    float d = Mathf.Sqrt(dx * dx + dy * dy);
                    if (d > 0.5f)
                    {
                        tex.SetPixel(x, y, Color.clear);
                        continue;
                    }
                    int mx = x % (diePixels + lineWidth);
                    int my = y % (diePixels + lineWidth);
                    bool onGrid = mx < lineWidth || my < lineWidth;
                    tex.SetPixel(x, y, onGrid ? Color.Lerp(gridLine, Color.clear, 0.5f) : wafer);
                }
            }
            for (int y = 0; y < 8; y++)
                for (int x = tex.width / 2 - 10; x < tex.width / 2 + 10; x++)
                    tex.SetPixel(x, tex.height / 2 - 4 + y, notch);
            tex.Apply(true);
            return tex;
        }

        static Texture2D GenerateScanLines(int thickness, int height)
        {
            var tex = new Texture2D(1, height, TextureFormat.RGBA32, false);
            for (int y = 0; y < height; y++)
            {
                float a = (y % (thickness * 2) < thickness) ? 0f : 1f;
                tex.SetPixel(0, y, new Color(0, 0, 0, a * 0.06f));
            }
            tex.Apply();
            tex.wrapMode = TextureWrapMode.Repeat;
            return tex;
        }

        void EmbedDefectVisuals()
        {
            // Defect visuals temporarily disabled per request. Detection/scoring
            // logic still runs; only the on-wafer console markers are skipped.
            if (true) return;

            var instances = flow.CurrentWafer.GetDefectInstances();
            for (int i = 0; i < instances.Count; i++)
            {
                var di = instances[i];
                var vis = CreateDefectVisual(di);
                di.visualObject = vis;
                if (vis != null && (di.isDetected || di.isHighlighted))
                {
                    ApplyHighlightedState(vis, di.profile.defectType);
                    // Emphasize detected defects without overwriting the parent-scale
                    // compensation baked into CreateDefectVisual.
                    vis.transform.localScale *= 1.15f;
                }
            }
        }

        GameObject CreateDefectVisual(DefectInstance di)
        {
            var p = di.profile;
            if (p == null) return null;
            var type = p.defectType;
            var color = DefectColor(type);
            var prim = DefaultPrimitive(type);
            int seed = Mathf.RoundToInt(di.localPosition.x * 1000f + di.localPosition.z * 1000f);
            var rot = DefaultRotation(type, seed);

            var go = GameObject.CreatePrimitive(prim);
            go.name = "Defect_" + p.name;
            go.transform.SetParent(wafer3D.transform);

            // The console wafer is a unit cylinder (local radius 0.5, top face at
            // local y = +1) scaled non-uniformly. The defect's authored localPosition
            // is in table-wafer meters (radius ~0.14). Remap it into the console
            // disc's local space so markers spread across the surface and sit ON TOP
            // of the thin disc rather than being buried at the mid-plane.
            const float TableRadius = 0.14f;
            float localX = (di.localPosition.x / TableRadius) * 0.42f; // fill ~0.42 of the 0.5 local radius
            float localZ = (di.localPosition.z / TableRadius) * 0.42f;
            go.transform.localPosition = new Vector3(localX, 1.0f, localZ);

            // Counter the parent's non-uniform scale so the marker keeps a real 3D
            // volume (otherwise it is squashed flat by the thin disc's tiny Y-scale).
            Vector3 ps = wafer3D.transform.lossyScale;
            Vector3 worldSize = di.baseScale * 2.2f; // enlarge for readability at console zoom
            go.transform.localScale = new Vector3(
                worldSize.x / Mathf.Max(0.0001f, ps.x),
                worldSize.y / Mathf.Max(0.0001f, ps.y),
                worldSize.z / Mathf.Max(0.0001f, ps.z));
            go.transform.localRotation = rot;

            var r = go.GetComponent<Renderer>();
            var m = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            m.color = color;
            m.SetFloat("_Metallic", 0.1f);
            m.SetFloat("_Smoothness", 0.2f);
            // Emissive so defects clearly read against the reflective silicon surface.
            m.EnableKeyword("_EMISSION");
            m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            m.SetColor("_EmissionColor", color * 0.6f);
            r.material = m;

            var c = go.GetComponent<Collider>();
            if (c != null) Destroy(c);

            return go;
        }

        static Color DefectColor(DefectType type)
        {
            return type switch
            {
                DefectType.BowingWarping => new Color(0.85f, 0.90f, 0.95f),
                DefectType.STIVoid => new Color(0.30f, 0.30f, 0.38f),
                DefectType.InterfaceRoughness => new Color(0.70f, 0.55f, 0.90f),
                DefectType.SilicideBridging => new Color(0.95f, 0.80f, 0.45f),
                DefectType.TungstenPlugVoid => new Color(0.45f, 0.45f, 0.50f),
                DefectType.SubstrateContamination => new Color(0.75f, 0.85f, 0.30f),
                _ => new Color(0.80f, 0.80f, 0.80f)
            };
        }

        static PrimitiveType DefaultPrimitive(DefectType type)
        {
            return type switch
            {
                DefectType.BowingWarping => PrimitiveType.Capsule,
                DefectType.STIVoid => PrimitiveType.Cube,
                DefectType.InterfaceRoughness => PrimitiveType.Sphere,
                DefectType.SilicideBridging => PrimitiveType.Capsule,
                DefectType.TungstenPlugVoid => PrimitiveType.Cylinder,
                DefectType.SubstrateContamination => PrimitiveType.Cylinder,
                _ => PrimitiveType.Sphere
            };
        }

        static Quaternion DefaultRotation(DefectType type, int seed)
        {
            float angle = (seed * 137.5f) % 360f;
            return type switch
            {
                DefectType.BowingWarping => Quaternion.Euler(90f, angle, 0f),
                DefectType.STIVoid => Quaternion.Euler(0f, angle, 90f),
                DefectType.SilicideBridging => Quaternion.Euler(90f, 90f, 0f),
                _ => Quaternion.identity
            };
        }

        static void ApplyHighlightedState(GameObject go, DefectType type)
        {
            var r = go.GetComponent<Renderer>();
            if (r == null) return;
            r.material.color = Color.Lerp(DefectColor(type), Color.white, 0.3f);
                r.material.SetFloat("_Metallic", 0.15f);
                r.material.SetFloat("_Smoothness", 0.2f);
            r.material.EnableKeyword("_EMISSION");
            r.material.SetColor("_EmissionColor", new Color(0, 0.6f, 0.3f));
        }

        void Update()
        {
            if (wafer3D == null || canvas == null || !canvas.gameObject.activeInHierarchy)
                return;

            var mouse = Mouse.current;
            var kb = Keyboard.current;

            // --- Zoom: scroll wheel (sign-normalized) + keyboard +/- fallback ---
            float zoomStep = 0f;
            if (mouse != null)
            {
                float scroll = mouse.scroll.y.ReadValue();
                if (scroll > 0.01f) zoomStep += 0.12f;
                else if (scroll < -0.01f) zoomStep -= 0.12f;
            }
            if (kb != null)
            {
                if (kb.equalsKey.isPressed || kb.numpadPlusKey.isPressed) zoomStep += 1.5f * Time.deltaTime;
                if (kb.minusKey.isPressed || kb.numpadMinusKey.isPressed) zoomStep -= 1.5f * Time.deltaTime;
            }
            if (Mathf.Abs(zoomStep) > 0.0001f)
                waferZoom = Mathf.Clamp(waferZoom + zoomStep, 0.5f, 3f);

            // Smoothly approach the target scale so zoom feels polished.
            Vector3 targetScale = Vector3.one * baseWaferScale * waferZoom;
            wafer3D.transform.localScale = Vector3.Lerp(
                wafer3D.transform.localScale, targetScale, Mathf.Clamp01(Time.deltaTime * 12f));

            // --- Drag to rotate (no idle spin) ---
            if (mouse != null)
            {
                bool overUI = UnityEngine.EventSystems.EventSystem.current != null
                    && UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject();
                if (mouse.leftButton.isPressed && !overUI)
                {
                    Vector2 d = mouse.delta.ReadValue();
                    wafer3D.transform.Rotate(Vector3.up, -d.x * 0.8f, Space.World);
                    wafer3D.transform.Rotate(Vector3.right, d.y * 0.5f, Space.World);
                }
            }
        }

        void ClearDynamic()
        {
            if (header != null) { Destroy(header); header = null; }
            if (defectLog != null) { Destroy(defectLog); defectLog = null; }
            if (sidePanel != null) { Destroy(sidePanel); sidePanel = null; }
            if (toolGroup != null) { Destroy(toolGroup); toolGroup = null; }
            if (instrDisplay != null) { Destroy(instrDisplay.gameObject); instrDisplay = null; }
            if (instrLabel != null) { Destroy(instrLabel); instrLabel = null; }
            if (statusBar != null) { Destroy(statusBar); statusBar = null; }
            if (wafer3D != null) { Destroy(wafer3D); wafer3D = null; }
            if (waferLight != null) { Destroy(waferLight); waferLight = null; }
            if (waferFill != null) { Destroy(waferFill); waferFill = null; }
            if (waferRim != null) { Destroy(waferRim); waferRim = null; }
            if (currentScanRoutine != null) { StopCoroutine(currentScanRoutine); currentScanRoutine = null; }

            var instances = flow?.CurrentWafer?.GetDefectInstances();
            if (instances != null)
            {
                for (int i = 0; i < instances.Count; i++)
                    instances[i].visualObject = null;
            }
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
            tx.fontSize = UITheme.Scaled(size);
            tx.fontStyle = fs;
            tx.alignment = TextAnchor.MiddleCenter;
            tx.color = c;
            tx.raycastTarget = false;
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = min; rt.anchorMax = max;
            rt.sizeDelta = Vector2.zero;
            return go;
        }

        static string ColorToHex(Color c)
        {
            return ((int)(c.r * 255)).ToString("X2") +
                   ((int)(c.g * 255)).ToString("X2") +
                   ((int)(c.b * 255)).ToString("X2");
        }
    }
}
