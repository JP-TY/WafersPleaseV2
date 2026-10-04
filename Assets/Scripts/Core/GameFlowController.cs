using UnityEngine;
using UnityEngine.UI;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;
using WafersPlease.Config;
using WafersPlease.Interaction;
using WafersPlease.Systems.Analytics;
using WafersPlease.Systems.Education;
using WafersPlease.Systems.Decision;
using WafersPlease.Systems.Progression;
using WafersPlease.Systems.Rework;
using WafersPlease.Systems.Scoring;
using WafersPlease.Systems.Wafers;
using WafersPlease.UI;

namespace WafersPlease.Core
{
    public class GameFlowController : MonoBehaviour
    {
        DayProgressionController progression;
        ScoreManager scoreManager;
        AnalyticsTracker analytics;
        ScaffoldingController scaffolding;
        DispositionHandler dispositionHandler;
        WaferSpawner waferSpawner;
        CameraController cam;

        public WaferController CurrentWafer { get; private set; }
        public bool IsGameActive { get; private set; }
        public ScaffoldingController Scaffolding => scaffolding;

        Font defaultFont;
        GameObject overlayCanvas;

        void Awake()
        {
            progression = GetComponent<DayProgressionController>();
            scoreManager = GetComponent<ScoreManager>();
            analytics = GetComponent<AnalyticsTracker>();
            scaffolding = GetComponent<ScaffoldingController>();
            if (scaffolding == null) scaffolding = gameObject.AddComponent<ScaffoldingController>();
            waferSpawner = GetComponentInChildren<WaferSpawner>();
            cam = FindAnyObjectByType<CameraController>();
            BootstrapUIInputModule();
        }

        void BootstrapUIInputModule()
        {
            var es = FindAnyObjectByType<EventSystem>();
            if (es == null) return;

            var module = es.GetComponent<InputSystemUIInputModule>();
            if (module == null) return;
            if (module.actionsAsset != null) return;

            var asset = ScriptableObject.CreateInstance<InputActionAsset>();

            var uiMap = new InputActionMap("UI");
            asset.AddActionMap(uiMap);

            uiMap.AddAction("Point", InputActionType.Value, "<Mouse>/position");
            uiMap.AddAction("Click", InputActionType.Button, "<Mouse>/leftButton");
            uiMap.AddAction("RightClick", InputActionType.Button, "<Mouse>/rightButton");
            uiMap.AddAction("MiddleClick", InputActionType.Button, "<Mouse>/middleButton");
            uiMap.AddAction("ScrollWheel", InputActionType.Value, "<Mouse>/scroll");
            uiMap.AddAction("Submit", InputActionType.Button, "<Keyboard>/enter");
            uiMap.AddAction("Cancel", InputActionType.Button, "<Keyboard>/escape");
            uiMap.AddAction("Move", InputActionType.Value, "<Keyboard>/wasd");

            module.actionsAsset = asset;
        }

        void Start()
        {
            defaultFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            ShowBriefing(() => BeginGame());
        }        void ShowBriefing(System.Action onDismiss)
        {
            // Guard against stale briefing listeners / overlays from a prior day.
            foreach (var stale in GetComponentsInChildren<BriefingInput>(true)) Destroy(stale.gameObject);
            if (overlayCanvas != null) { Destroy(overlayCanvas); overlayCanvas = null; }
            var gm = GameManager.Instance;
            var cfg = gm != null ? gm.CurrentDayConfig : null;
            int dayNum = progression.CurrentDay;
            int totalDays = gm != null ? gm.dayConfigs.Length : 3;

            overlayCanvas = CreateOverlay(0f);

            // Centered card panel for the briefing content.
            var card = UITheme.Panel(overlayCanvas.transform,
                new Vector2(0.22f, 0.16f), new Vector2(0.78f, 0.86f), UITheme.PanelBgSolid);
            var accentBar = UITheme.Panel(card.transform,
                new Vector2(0.06f, 0.87f), new Vector2(0.94f, 0.885f), UITheme.Accent);
            accentBar.raycastTarget = false;

            string title = dayNum == 1 ? "WAFERS PLEASE" : $"DAY {dayNum}";
            CreateText(card.gameObject, title, 40, FontStyle.Bold, UITheme.Accent,
                new Vector2(0, 0.74f), new Vector2(1, 0.9f));

            CreateText(card.gameObject, "Semiconductor Inspection Simulator", 18, FontStyle.Normal,
                UITheme.TextSecondary, new Vector2(0, 0.66f), new Vector2(1, 0.74f));

            string text = cfg != null && !string.IsNullOrEmpty(cfg.briefingText)
                ? cfg.briefingText
                : "Inspect wafers for defects using precision metrology tools.\n\n"
                + "1.  Click the FOUP to retrieve a wafer.\n"
                + "2.  Use the Console to scan for defects.\n"
                + "3.  Stamp your decision at the Inspection Station.\n\n"
                + "Press SPACE or click to begin.";

            CreateText(card.gameObject, text, 20, FontStyle.Normal, UITheme.TextPrimary,
                new Vector2(0.1f, 0.24f), new Vector2(0.9f, 0.62f));

            CreateText(card.gameObject, $"Day {dayNum} of {totalDays}",
                16, FontStyle.Bold, UITheme.TextMuted,
                new Vector2(0, 0.14f), new Vector2(1, 0.2f));

            CreateText(card.gameObject, "\u25b8  PRESS SPACE OR CLICK TO BEGIN", 16, FontStyle.Bold,
                UITheme.Warn, new Vector2(0, 0.05f), new Vector2(1, 0.11f));

            var bg = overlayCanvas.transform.GetChild(0)?.GetComponent<Image>();
            StartCoroutine(FadeInCanvas(bg, () =>
            {
                var listener = new GameObject("BriefingInput");
                listener.transform.SetParent(transform);
                var input = listener.AddComponent<BriefingInput>();
                input.onDismiss = () =>
                {
                    if (listener != null) Destroy(listener);
                    Destroy(overlayCanvas);
                    overlayCanvas = null;
                    onDismiss?.Invoke();
                };
            }));
        }

        System.Collections.IEnumerator FadeInCanvas(Image bg, System.Action onComplete)
        {
            float t = 0f;
            while (t < 0.8f)
            {
                t += Time.deltaTime;
                if (bg != null)
                    bg.color = new Color(0.02f, 0.03f, 0.05f, Mathf.Clamp01(t / 0.8f) * 0.97f);
                yield return null;
            }
            onComplete?.Invoke();
        }

        public void BeginGame()
        {
            scoreManager.ResetScore();
            analytics.Reset();
            ReworkState.Reset();
            if (scaffolding != null) scaffolding.ResetCallouts();
            IsGameActive = true;
            StartDay(1);
        }

        public void StartDay(int dayNumber)
        {
            var gm = GameManager.Instance;
            if (gm == null) return;

            if (waferSpawner != null)
                waferSpawner.DespawnWafer();
            CurrentWafer = null;

            var cc = FindAnyObjectByType<ConsoleController>();
            if (cc != null) cc.ForceClose();

            if (cam != null)
            {
                cam.ExitZoom();
                cam.ResetToStart();
            }

            gm.InitializeDay(dayNumber - 1);
            progression.StartDay(dayNumber, gm.CurrentDayConfig);

            if (gm.CurrentRuleMatrix != null)
                dispositionHandler = new DispositionHandler(gm.CurrentRuleMatrix);

            if (waferSpawner != null)
                waferSpawner.dayConfig = gm.CurrentDayConfig;

            // Dispense the first wafer automatically once the shift is live (after
            // any briefing overlay has been dismissed), so the loop starts cleanly.
            StartCoroutine(SpawnFirstWaferWhenReady());
        }

        System.Collections.IEnumerator SpawnFirstWaferWhenReady()
        {
            // Wait until the shift is active and no blocking overlay is up.
            float guard = 0f;
            while ((!IsGameActive || overlayCanvas != null) && guard < 30f)
            {
                guard += Time.deltaTime;
                yield return null;
            }
            if (!IsGameActive) yield break;
            if (CurrentWafer != null) yield break;
            if (progression.CurrentPhase == ShiftPhase.Review
                || progression.CurrentPhase == ShiftPhase.EndOfDay) yield break;
            yield return new WaitForSeconds(0.4f);
            if (CurrentWafer == null && IsGameActive)
                SpawnNextWafer();
        }

        public void SpawnNextWafer()
        {
            if (waferSpawner == null) return;

            CurrentWafer = waferSpawner.SpawnWafer();
            if (CurrentWafer != null)
            {
                analytics.RegisterWaferStart();
                CurrentWafer.BeginInspection();
                StartCoroutine(PulseNewWafer());
            }
        }

        System.Collections.IEnumerator PulseNewWafer()
        {
            if (CurrentWafer == null) yield break;
            // Animated arrival glow: pulse the emissive highlight a few times so the
            // player's eye is drawn to the freshly dispensed wafer.
            float t = 0f;
            const float dur = 2.2f;
            while (t < dur && CurrentWafer != null)
            {
                t += Time.deltaTime;
                float pulse = Mathf.Abs(Mathf.Sin(t * Mathf.PI * 1.5f)) * (1f - t / dur);
                CurrentWafer.SetHighlightIntensity(pulse);
                yield return null;
            }
            if (CurrentWafer != null) CurrentWafer.SetHighlight(false);
        }

        public void SubmitDisposition(StampType playerDecision)
        {
            if (CurrentWafer == null || dispositionHandler == null) return;

            var defects = CurrentWafer.GetDetectedDefects();
            var allDefects = CurrentWafer.GetDefects();
            var result = dispositionHandler.Evaluate(defects);
            result.playerDecision = playerDecision;
            result.isCorrect = playerDecision == StampFromAction(result.correctAction);
            // GDD Section 10: differentiated risk flags for scoring + analytics.
            bool hasKillerDefect = false;
            foreach (var d in allDefects)
                if (d != null && d.defectClass == DefectClass.Catastrophic) { hasKillerDefect = true; break; }
            result.isFalseAccept = playerDecision == StampType.Accept
                                   && (result.correctAction != ActionPath.Accept || hasKillerDefect);
            result.isFalseReject = playerDecision == StampType.Reject
                                   && (defects == null || defects.Length == 0);
            // Process Out-of-Sequence: stamping before revealing every defect with the
            // correct metrology tool logs a compliance strike (minor penalty).
            bool processOutOfSequence = !CurrentWafer.AllDefectsDetected();
            result.confidence = processOutOfSequence ? 0f : result.confidence;
            analytics.RegisterMetrology(CurrentWafer.RequiredTools().Count, CurrentWafer.ToolsUsedCount, processOutOfSequence);


                        scoreManager.RegisterDisposition(result, processOutOfSequence);
            analytics.RegisterDisposition(result);
            CurrentWafer.CompleteDisposition();
            progression.RegisterWaferProcessed();
            ReworkState.NotifyWaferProcessed();

            if (waferSpawner != null)
                waferSpawner.DespawnWafer();
            CurrentWafer = null;

            if (scoreManager.Competency <= 0f)
            {
                ShowGameOver();
                return;
            }

            if (progression.CurrentPhase == ShiftPhase.Review)
            {
                EndDay();
                return;
            }

            // Auto-advance: after the result overlay / camera return, dispense the
            // next wafer automatically so the player never has to hunt for the FOUP.
            if (IsGameActive)
                StartCoroutine(AutoAdvanceNextWafer());
        }

        /// <summary>
        /// True between a disposition and the next wafer being dispensed. The HUD reads
        /// this to show a "next wafer incoming" prompt.
        /// </summary>
        public bool AwaitingNextWafer { get; private set; }

        System.Collections.IEnumerator AutoAdvanceNextWafer()
        {
            AwaitingNextWafer = true;
            // Let the result overlay play and the camera finish returning to the desk.
            yield return new WaitForSeconds(2.4f);

            // Bail out if state changed while waiting (day ended, game over, or the
            // player already pulled a wafer from the FOUP manually).
            if (!IsGameActive || CurrentWafer != null
                || progression.CurrentPhase == ShiftPhase.Review
                || progression.CurrentPhase == ShiftPhase.EndOfDay)
            {
                AwaitingNextWafer = false;
                yield break;
            }

            AwaitingNextWafer = false;
            SpawnNextWafer();
        }

        void EndDay()
        {
            progression.EndDay();
            IsGameActive = false;
            if (cam != null) cam.ExitZoom();
            ShowEndOfDayScreen();
        }

        void ShowEndOfDayScreen()
        {
            var gm = GameManager.Instance;
            bool isLastDay = gm == null || !gm.HasNextDay();
            string title = isLastDay ? "CERTIFICATION COMPLETE" : $"DAY {progression.CurrentDay} COMPLETE";
            string subtitle = isLastDay
                ? "You have completed all training days."
                : "Prepare for the next shift.";

            int salary = scoreManager.Salary;
            float competency = scoreManager.Competency;
            float accuracy = scoreManager.GetAccuracy();
            int inspected = scoreManager.TotalInspected;
            int correct = scoreManager.CorrectDispositions;
            int totalDays = gm != null ? gm.dayConfigs.Length : 3;
            // GDD Section 10: dual-gate evaluation. Player must meet BOTH the salary
            // target AND the competency target to pass the shift and advance.
            var dayCfg = gm != null ? gm.CurrentDayConfig : null;
            float salaryTarget = dayCfg != null ? dayCfg.salaryTarget : 0f;
            float competencyTarget = dayCfg != null ? dayCfg.competencyTarget : 0f;
            bool metSalary = salary >= salaryTarget;
            bool metCompetency = competency >= competencyTarget;
            bool shiftPassed = metSalary && metCompetency;
            if (!shiftPassed)
            {
                title = "SHIFT NOT PASSED";
                subtitle = metSalary ? "Competency below certification standard. Retry required."
                    : (metCompetency ? "Yield/salary below quota. Retry required."
                                     : "Quota and competency below standard. Retry required.");
            }


            overlayCanvas = CreateOverlay(0f);
            var bg = overlayCanvas.transform.GetChild(0).GetComponent<Image>();

            var card = UITheme.Panel(overlayCanvas.transform,
                new Vector2(0.28f, 0.10f), new Vector2(0.72f, 0.90f), UITheme.PanelBgSolid);
            var accentBar = UITheme.Panel(card.transform,
                new Vector2(0.06f, 0.895f), new Vector2(0.94f, 0.905f), UITheme.Accent);
            accentBar.raycastTarget = false;

            CreateText(card.gameObject, title, 30, FontStyle.Bold, UITheme.Accent,
                new Vector2(0, 0.80f), new Vector2(1, 0.885f));

            CreateText(card.gameObject, subtitle, 18, FontStyle.Normal, UITheme.TextSecondary,
                new Vector2(0, 0.745f), new Vector2(1, 0.80f));

            CreateText(card.gameObject, $"Day {progression.CurrentDay} of {totalDays}", 15, FontStyle.Bold,
                UITheme.TextMuted, new Vector2(0, 0.70f), new Vector2(1, 0.745f));

            if (!shiftPassed)
            {
                CreateText(card.gameObject,
                    metSalary ? "Competency below certification standard."
                              : (metCompetency ? "Yield/salary below quota."
                                               : "Both quota and competency below standard."),
                    16, FontStyle.Bold, UITheme.Bad,
                    new Vector2(0, 0.655f), new Vector2(1, 0.70f));
            }

            StatRow(card.transform, "Wafers Inspected", $"{inspected}", 0.595f, UITheme.TextPrimary);
            StatRow(card.transform, "Correct Decisions", $"{correct} / {inspected}", 0.535f, UITheme.TextPrimary);
            StatRow(card.transform, "Accuracy", $"{accuracy:P0}", 0.475f,
                accuracy >= 0.85f ? UITheme.Good : accuracy >= 0.6f ? UITheme.Warn : UITheme.Bad);
            StatRow(card.transform, "Salary", $"₱{salary}", 0.415f, UITheme.Good);
            StatRow(card.transform, "Competency", $"{competency:F1}%", 0.355f,
                UITheme.HealthColor(competency / 100f));

            // Dual-gate target readout (below the stat rows, above the diagnostic panel).
            CreateTextAligned(card.gameObject,
                $"Salary Target: ₱{salaryTarget:F0}   {(metSalary ? "\u2714" : "\u2717")}",
                14, FontStyle.Bold, metSalary ? UITheme.Good : UITheme.Bad,
                new Vector2(0.08f, 0.305f), new Vector2(0.5f, 0.345f), TextAnchor.MiddleLeft);
            CreateTextAligned(card.gameObject,
                $"Competency Target: {competencyTarget:F0}%   {(metCompetency ? "\u2714" : "\u2717")}",
                14, FontStyle.Bold, metCompetency ? UITheme.Good : UITheme.Bad,
                new Vector2(0.5f, 0.305f), new Vector2(0.92f, 0.345f), TextAnchor.MiddleLeft);

            // GDD Section 11: Incident Printer diagnostic feedback.
            var diag = analytics.GenerateDiagnosticSheet(
                scoreManager.FalseAccepts, scoreManager.FalseRejects, accuracy);
            var diagPanel = UITheme.Panel(card.transform,
                new Vector2(0.08f, 0.185f), new Vector2(0.92f, 0.29f), new Color(0.05f, 0.07f, 0.06f, 0.9f));
            diagPanel.raycastTarget = false;
            CreateTextAligned(card.gameObject, diag, 12, FontStyle.Normal, UITheme.TextSecondary,
                new Vector2(0.1f, 0.185f), new Vector2(0.9f, 0.29f), TextAnchor.UpperLeft);

            // GDD Section 12: optional shift-end micro-quiz for competency boost.
            if (scaffolding != null)
            {
                var quizBtn = UITheme.Button(card.transform, "TAKE REVIEW QUIZ (+competency)", new Color(0.16f, 0.42f, 0.30f),
                    new Vector2(0.22f, 0.02f), new Vector2(0.78f, 0.065f), null, 13);
                quizBtn.onClick.AddListener(() =>
                {
                    quizBtn.interactable = false;
                    scaffolding.ShowMicroQuiz((correct) =>
                    {
                        float boost = correct * 2f; // +2% operator rating per correct answer
                        scoreManager.BoostOperatorProfile(boost); // requirements.md:28 - cosmetic only, NOT gate-relevant
                        // NOTE: quiz reward intentionally does NOT modify the dual-gate Competency stat.
                        var quizTxt = quizBtn.GetComponentInChildren<UnityEngine.UI.Text>();
                        if (quizTxt != null) quizTxt.text = $"QUIZ COMPLETE (+{boost:F0}% operator rating)";
                    });
                });
            }

            string btnLabel = !shiftPassed ? "RETRY SHIFT" : (isLastDay ? "FINISH" : "NEXT DAY");
            UITheme.Button(card.transform, btnLabel, UITheme.AccentDim,
                new Vector2(0.3f, 0.10f), new Vector2(0.7f, 0.155f), () =>
                {
                    Destroy(overlayCanvas);
                    overlayCanvas = null;
                    if (!shiftPassed)
                    {
                        // Failed the dual-gate: replay the current shift.
                        StartDay(progression.CurrentDay);
                        ShowBriefing(() => { IsGameActive = true; });
                    }
                    else if (isLastDay)
                        ShowVictory();
                    else
                    {
                                                gm.AdvanceToNextDay();
                        int nextDay = gm.CurrentDayIndex + 1;
                        StartDay(nextDay);
                        ShowBriefing(() => { IsGameActive = true; });
                    }
                });

            StartCoroutine(FadeInCanvas(bg, null));
        }

        /// <summary>A left-aligned label + right-aligned value row inside a card.</summary>
        void StatRow(Transform card, string label, string value, float y, Color valueColor)
        {
            CreateTextAligned(card.gameObject, label, 20, FontStyle.Normal, UITheme.TextSecondary,
                new Vector2(0.14f, y), new Vector2(0.55f, y + 0.06f), TextAnchor.MiddleLeft);
            CreateTextAligned(card.gameObject, value, 20, FontStyle.Bold, valueColor,
                new Vector2(0.55f, y), new Vector2(0.86f, y + 0.06f), TextAnchor.MiddleRight);
        }

        void ShowGameOver()
        {
            IsGameActive = false;
            if (cam != null) cam.ExitZoom();
            overlayCanvas = CreateOverlay(0f);
            var bg = overlayCanvas.transform.GetChild(0).GetComponent<Image>();

            var card = UITheme.Panel(overlayCanvas.transform,
                new Vector2(0.3f, 0.28f), new Vector2(0.7f, 0.74f), UITheme.PanelBgSolid);
            var accentBar = UITheme.Panel(card.transform,
                new Vector2(0.06f, 0.88f), new Vector2(0.94f, 0.9f), UITheme.Bad);
            accentBar.raycastTarget = false;

            CreateText(card.gameObject, "GAME OVER", 40, FontStyle.Bold, UITheme.Bad,
                new Vector2(0, 0.68f), new Vector2(1, 0.85f));

            CreateText(card.gameObject, "Your competency has fallen to zero.\nYou are no longer fit for duty.",
                20, FontStyle.Normal, UITheme.TextPrimary,
                new Vector2(0.1f, 0.42f), new Vector2(0.9f, 0.62f));

            CreateText(card.gameObject,
                $"Final Salary: ₱{scoreManager.Salary}    |    Wafers: {scoreManager.TotalInspected}",
                18, FontStyle.Bold, UITheme.TextSecondary,
                new Vector2(0, 0.3f), new Vector2(1, 0.38f));

            UITheme.Button(card.gameObject.transform, "RESTART", new Color(0.5f, 0.15f, 0.15f),
                new Vector2(0.3f, 0.08f), new Vector2(0.7f, 0.2f), () =>
                {
                    Destroy(overlayCanvas);
                    overlayCanvas = null;
                    SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
                });

            StartCoroutine(FadeInCanvas(bg, null));
        }

        void ShowVictory()
        {
            overlayCanvas = CreateOverlay(0f);
            var bg = overlayCanvas.transform.GetChild(0).GetComponent<Image>();

            var card = UITheme.Panel(overlayCanvas.transform,
                new Vector2(0.3f, 0.2f), new Vector2(0.7f, 0.82f), UITheme.PanelBgSolid);
            var accentBar = UITheme.Panel(card.transform,
                new Vector2(0.06f, 0.9f), new Vector2(0.94f, 0.915f), UITheme.Good);
            accentBar.raycastTarget = false;

            CreateText(card.gameObject, "CONGRATULATIONS!", 36, FontStyle.Bold, UITheme.Good,
                new Vector2(0, 0.78f), new Vector2(1, 0.9f));

            CreateText(card.gameObject, "Certification complete. You are a qualified inspector.",
                18, FontStyle.Normal, UITheme.TextSecondary,
                new Vector2(0.08f, 0.7f), new Vector2(0.92f, 0.78f));

            StatRow(card.transform, "Final Salary", $"₱{scoreManager.Salary}", 0.55f, UITheme.Good);
            StatRow(card.transform, "Competency", $"{scoreManager.Competency:F1}%", 0.47f,
                UITheme.HealthColor(scoreManager.Competency / 100f));
            StatRow(card.transform, "Accuracy", $"{scoreManager.GetAccuracy():P0}", 0.39f, UITheme.Accent);
            StatRow(card.transform, "Wafers Processed", $"{scoreManager.TotalInspected}", 0.31f, UITheme.TextPrimary);

            UITheme.Button(card.gameObject.transform, "PLAY AGAIN", UITheme.AccentDim,
                new Vector2(0.3f, 0.07f), new Vector2(0.7f, 0.18f), () =>
                {
                    Destroy(overlayCanvas);
                    overlayCanvas = null;
                    SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
                });

            StartCoroutine(FadeInCanvas(bg, null));
        }

        GameObject CreateOverlay(float alpha)
        {
            var go = new GameObject("OverlayCanvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            go.transform.SetParent(transform);
            var canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 200;

            var scaler = go.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);

            var bg = new GameObject("Background", typeof(Image));
            bg.transform.SetParent(canvas.transform, false);
            var img = bg.GetComponent<Image>();
            img.color = new Color(0.05f, 0.05f, 0.08f, alpha);

            var rt = bg.GetComponent<RectTransform>();
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.sizeDelta = Vector2.zero;
            rt.anchoredPosition = Vector2.zero;

            return go;
        }

        GameObject CreateText(GameObject parent, string text, int fontSize, FontStyle style, Color color,
            Vector2 anchorMin, Vector2 anchorMax)
        {
            var go = new GameObject("Text", typeof(Text));
            go.transform.SetParent(parent.transform, false);
            var txt = go.GetComponent<Text>();
            txt.font = defaultFont;
            txt.text = text;
            txt.fontSize = UITheme.Scaled(fontSize);
            txt.fontStyle = style;
            txt.alignment = TextAnchor.MiddleCenter;
            txt.color = color;

            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = anchorMin;
            rt.anchorMax = anchorMax;
            rt.sizeDelta = Vector2.zero;
            rt.anchoredPosition = Vector2.zero;

            return go;
        }

        GameObject CreateTextAligned(GameObject parent, string text, int fontSize, FontStyle style, Color color,
            Vector2 anchorMin, Vector2 anchorMax, TextAnchor align)
        {
            var go = CreateText(parent, text, fontSize, style, color, anchorMin, anchorMax);
            go.GetComponent<Text>().alignment = align;
            return go;
        }

        GameObject CreateButton(GameObject parent, string label, Color color,
            Vector2 anchorMin, Vector2 anchorMax, UnityEngine.Events.UnityAction onClick)
        {
            var go = new GameObject(label + "Btn", typeof(Image), typeof(Button));
            go.transform.SetParent(parent.transform, false);

            var img = go.GetComponent<Image>();
            img.color = color;

            var btn = go.GetComponent<Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(onClick);

            var cb = btn.colors;
            cb.normalColor = color;
            cb.highlightedColor = Color.Lerp(color, Color.white, 0.3f);
            cb.pressedColor = Color.Lerp(color, Color.black, 0.3f);
            cb.selectedColor = color;
            cb.fadeDuration = 0.15f;
            btn.colors = cb;

            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = anchorMin;
            rt.anchorMax = anchorMax;
            rt.sizeDelta = Vector2.zero;
            rt.anchoredPosition = Vector2.zero;

            var lbl = new GameObject("Label", typeof(Text));
            lbl.transform.SetParent(go.transform, false);
            var txt = lbl.GetComponent<Text>();
            txt.font = defaultFont;
            txt.text = label;
            txt.fontSize = 22;
            txt.fontStyle = FontStyle.Bold;
            txt.alignment = TextAnchor.MiddleCenter;
            txt.color = Color.white;

            var lrt = lbl.GetComponent<RectTransform>();
            lrt.anchorMin = Vector2.zero;
            lrt.anchorMax = Vector2.one;
            lrt.sizeDelta = Vector2.zero;
            lrt.anchoredPosition = Vector2.zero;

            return go;
        }

        static StampType StampFromAction(ActionPath path)
        {
            return path switch
            {
                ActionPath.Accept => StampType.Accept,
                ActionPath.Reject => StampType.Reject,
                _ => StampType.Rework
            };
        }
    }
}
