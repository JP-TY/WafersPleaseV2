using UnityEngine;
using UnityEngine.UI;
using WafersPlease.Config;
using WafersPlease.Core;
using WafersPlease.UI;using UnityEngine.InputSystem;

using System.Collections;
using System.Collections.Generic;

namespace WafersPlease.Systems.Education
{
    /// <summary>
    /// GDD Section 12 — Educational Scaffolding.
    /// • Context Prompts:  Technical callouts when metrology detects defects (Day 1 active, fade by Day 3).
    /// • Glossary Tablet:  Interactive lookup of glossaryEntry per defect from DefectProfileSO.
    /// • Micro-Quiz:       Optional 3-question review at shift end for competency boosts.
    /// Attaches to the same GameObject as GameFlowController.
    /// </summary>
    public class ScaffoldingController : MonoBehaviour
    {
        // ---- Context Prompt state ----
        GameObject calloutCanvas;
        Coroutine calloutRoutine;
        readonly HashSet<DefectType> shownCallouts = new HashSet<DefectType>();

        // ---- Glossary Tablet state ----
        GameObject glossaryCanvas;

        // ---- Micro-Quiz state (hardcoded 45nm questions per GDD) ----
        static readonly QuizQuestion[] quizBank = new QuizQuestion[]
        {
            new QuizQuestion("Why is Hafnium Oxide used instead of Silicon Dioxide in the 45nm gate stack?",
                new string[] { "Higher dielectric constant reduces leakage at thin EOT", "It is cheaper to deposit", "It has better thermal conductivity", "SiO₂ was banned at 45nm" },
                0),
            new QuizQuestion("What does a C49-phase residue on a silicide layer indicate?",
                new string[] { "Incomplete anneal — conductive stringers may bridge gate to S/D", "Normal fabrication result", "Photoresist contamination", "Oxide thinning" },
                0),
            new QuizQuestion("Why is high-NA lithography sensitive to wafer bowing?",
                new string[] { "Bowing shifts the surface outside the depth-of-focus window", "Bowing changes the refractive index", "Bowing increases exposure dose", "High-NA tools cannot detect bowed wafers" },
                0),
            new QuizQuestion("What is the primary risk of an STI seam void?",
                new string[] { "Inter-device current leakage through the isolation trench", "Increased gate capacitance", "Metal migration into the substrate", "Photomask misalignment" },
                0),
            new QuizQuestion("How does substrate contamination affect CMOS devices?",
                new string[] { "Shifts threshold voltage across paired transistors", "Increases carrier mobility", "Reduces interconnect resistance", "Improves gate oxide integrity" },
                0),
            new QuizQuestion("What metrology technique best detects tungsten plug voids?",
                new string[] { "Cross-sectional electron microscopy (SEM/TEM)", "Four-point probe sheet resistance", "Spectroscopic ellipsometry", "Visual inspection" },
                0),
        };

        // ===================================================================
        // Context Prompt: show a floating technical callout on defect detect
        // ===================================================================

        /// <summary>
        /// Called by ConsoleController or detection flow when a defect is detected.
        /// Shows a context prompt if the current day config enables them.
        /// </summary>
        public void OnDefectDetected(DefectProfileSO defect)
        {
            if (defect == null) return;

            var gm = GameManager.Instance;
            if (gm == null || gm.CurrentDayConfig == null) return;
            if (!gm.CurrentDayConfig.showContextPrompts) return;

            // GDD: "first occurrence per defect class" fading by Day 3
            if (shownCallouts.Contains(defect.defectType)) return;
            shownCallouts.Add(defect.defectType);

            // Build callout text from diagnosticIndicators
            if (defect.diagnosticIndicators == null || defect.diagnosticIndicators.Length == 0) return;

            string indicator = defect.diagnosticIndicators[0];
            string calloutText = $"⚠ {defect.displayName}: {indicator}";

            ShowCallout(calloutText);
        }

        void ShowCallout(string text)
        {
            if (calloutRoutine != null) StopCoroutine(calloutRoutine);
            if (calloutCanvas != null) Destroy(calloutCanvas);
            calloutRoutine = StartCoroutine(CalloutRoutine(text));
        }

        IEnumerator CalloutRoutine(string text)
        {
            // Build a small overlay at top of screen
            calloutCanvas = new GameObject("CalloutCanvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var c = calloutCanvas.GetComponent<Canvas>();
            c.renderMode = RenderMode.ScreenSpaceOverlay;
            c.sortingOrder = 250;
            var scaler = calloutCanvas.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);

            // Semi-transparent bar at top
            var bar = UITheme.Panel(calloutCanvas.transform, new Vector2(0.1f, 0.88f), new Vector2(0.9f, 0.95f),
                new Color(0.05f, 0.08f, 0.12f, 0.92f));

            // Accent stripe
            var stripe = UITheme.Panel(bar.transform, new Vector2(0f, 0f), new Vector2(0.005f, 1f), UITheme.Accent);
            stripe.raycastTarget = false;

            // Text
            UITheme.Label(bar.transform, text, 16, FontStyle.Normal, UITheme.Accent,
                new Vector2(0.02f, 0f), new Vector2(0.98f, 1f), TextAnchor.MiddleLeft);

            // Display for 5 seconds then fade
            yield return new WaitForSeconds(5f);

            float t = 0f;
            var cg = calloutCanvas.AddComponent<CanvasGroup>();
            while (t < 1f)
            {
                t += Time.deltaTime * 0.5f; // 2-second fade
                cg.alpha = 1f - t;
                yield return null;
            }

            Destroy(calloutCanvas);
            calloutCanvas = null;
            calloutRoutine = null;
        }

        /// <summary>Reset shown callouts at start of each shift.</summary>
        public void ResetCallouts()
        {
            shownCallouts.Clear();
            if (calloutCanvas != null) { Destroy(calloutCanvas); calloutCanvas = null; }
            if (calloutRoutine != null) { StopCoroutine(calloutRoutine); calloutRoutine = null; }
        }

        // ===================================================================
        // Glossary Tablet: open/close overlay with defect glossary entries
        // ===================================================================

        public void OpenGlossary()
        {
            if (glossaryCanvas != null) { CloseGlossary(); return; } // toggle

            glossaryCanvas = new GameObject("GlossaryCanvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var c = glossaryCanvas.GetComponent<Canvas>();
            c.renderMode = RenderMode.ScreenSpaceOverlay;
            c.sortingOrder = 300;
            var scaler = glossaryCanvas.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);

            // Backdrop
            var backdrop = UITheme.FullBackdrop(glossaryCanvas.transform, new Color(0f, 0f, 0f, 0.7f));
            var backdropBtn = backdrop.gameObject.AddComponent<Button>();
            backdropBtn.transition = Selectable.Transition.None;
            backdropBtn.onClick.AddListener(CloseGlossary);

            // Framed fab-terminal card with built-in header.
            var card = UITheme.TerminalPanel(glossaryCanvas.transform,
                new Vector2(0.15f, 0.05f), new Vector2(0.85f, 0.95f),
                "FAB GLOSSARY  \u2022  45nm PROCESS REFERENCE", UITheme.Accent, UITheme.PanelBgSolid);

            // (title now lives in the TerminalPanel header)

            // (accent underline is part of the TerminalPanel header)

            // Gather defect profiles from the current day config (runtime-safe)
            var gm = GameManager.Instance;
            DefectProfileSO[] profiles = null;
            if (gm != null && gm.CurrentDayConfig != null && gm.CurrentDayConfig.allowedDefects != null)
                profiles = gm.CurrentDayConfig.allowedDefects;

            if (profiles == null || profiles.Length == 0)
            {
                UITheme.Label(card.transform, "No defect profiles loaded.", 18, FontStyle.Italic, UITheme.TextMuted,
                    new Vector2(0.05f, 0.4f), new Vector2(0.95f, 0.6f));
            }
            else
            {
                float y = 0.86f;
                foreach (var dp in profiles)
                {
                    if (dp == null) continue;
                    string entry = string.IsNullOrEmpty(dp.glossaryEntry) ? "(No glossary data)" : dp.glossaryEntry;
                    string toolName = dp.requiredTool.ToString();

                    // Defect name
                    UITheme.Label(card.transform, $"■ {dp.displayName}  [Tool: {toolName}]", 16, FontStyle.Bold, UITheme.Warn,
                        new Vector2(0.05f, y - 0.04f), new Vector2(0.95f, y), TextAnchor.MiddleLeft);
                    y -= 0.045f;

                    // Glossary text
                    UITheme.Label(card.transform, entry, 13, FontStyle.Normal, UITheme.TextSecondary,
                        new Vector2(0.07f, y - 0.08f), new Vector2(0.93f, y), TextAnchor.UpperLeft);
                    y -= 0.10f;
                }
            }

            // Close button removed per design: backdrop-click or Escape closes the glossary.
        }

        public void CloseGlossary()
        {
            if (glossaryCanvas != null) { Destroy(glossaryCanvas); glossaryCanvas = null; }
        }

void Update()
        {
            // Close the glossary on Escape for a natural 'exit' gesture.
            if (glossaryCanvas != null && Keyboard.current != null
                && Keyboard.current[Key.Escape].wasPressedThisFrame)
            {
                CloseGlossary();
            }
        }


        // ===================================================================
        // Micro-Quiz: optional 3-question review at shift end
        // ===================================================================

        /// <summary>
        /// Shows a 3-question quiz overlay. On completion, calls onDone(correctCount).
        /// </summary>
        public void ShowMicroQuiz(System.Action<int> onDone)
        {
            StartCoroutine(QuizRoutine(onDone));
        }

        IEnumerator QuizRoutine(System.Action<int> onDone)
        {
            // Pick 3 random questions
            var pool = new List<QuizQuestion>(quizBank);
            var selected = new List<QuizQuestion>();
            for (int i = 0; i < 3 && pool.Count > 0; i++)
            {
                int idx = Random.Range(0, pool.Count);
                selected.Add(pool[idx]);
                pool.RemoveAt(idx);
            }

            int correctCount = 0;

            foreach (var q in selected)
            {
                bool answered = false;
                bool correct = false;

                // Build quiz overlay
                var quizCanvas = new GameObject("QuizCanvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
                var cv = quizCanvas.GetComponent<Canvas>();
                cv.renderMode = RenderMode.ScreenSpaceOverlay;
                cv.sortingOrder = 350;
                var sc = quizCanvas.GetComponent<CanvasScaler>();
                sc.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
                sc.referenceResolution = new Vector2(1920, 1080);

                UITheme.FullBackdrop(quizCanvas.transform, new Color(0f, 0f, 0f, 0.75f));

                var card = UITheme.Panel(quizCanvas.transform,
                    new Vector2(0.2f, 0.15f), new Vector2(0.8f, 0.85f), UITheme.PanelBgSolid);

                UITheme.Label(card.transform, "SHIFT-END REVIEW", 20, FontStyle.Bold, UITheme.Accent,
                    new Vector2(0f, 0.9f), new Vector2(1f, 0.97f));

                UITheme.Label(card.transform, q.question, 17, FontStyle.Normal, UITheme.TextPrimary,
                    new Vector2(0.05f, 0.7f), new Vector2(0.95f, 0.88f), TextAnchor.UpperLeft);

                // Answer buttons
                float by = 0.60f;
                for (int a = 0; a < q.answers.Length; a++)
                {
                    int ansIdx = a;
                    string prefix = (char)('A' + a) + ") ";
                    UITheme.Button(card.transform, prefix + q.answers[a],
                        a == q.correctIndex ? UITheme.AccentDim : UITheme.AccentDim,
                        new Vector2(0.05f, by - 0.10f), new Vector2(0.95f, by), () =>
                        {
                            correct = (ansIdx == q.correctIndex);
                            answered = true;
                        }, 14);
                    by -= 0.13f;
                }

                // Wait for answer
                while (!answered) yield return null;

                if (correct) correctCount++;

                // Brief feedback
                UITheme.Label(card.transform, correct ? "✓ Correct!" : "✗ Incorrect",
                    22, FontStyle.Bold, correct ? UITheme.Good : UITheme.Bad,
                    new Vector2(0f, 0.05f), new Vector2(1f, 0.15f));

                yield return new WaitForSeconds(1.5f);
                Destroy(quizCanvas);
            }

            onDone?.Invoke(correctCount);
        }

        // ---- Quiz question data class ----
        class QuizQuestion
        {
            public string question;
            public string[] answers;
            public int correctIndex;

            public QuizQuestion(string q, string[] a, int c)
            {
                question = q;
                answers = a;
                correctIndex = c;
            }
        }
    }
}
