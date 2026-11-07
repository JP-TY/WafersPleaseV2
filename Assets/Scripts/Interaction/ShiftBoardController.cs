using UnityEngine;
using UnityEngine.UI;
using WafersPlease.Core;
using WafersPlease.Systems.Progression;
using WafersPlease.Systems.Rework;
using WafersPlease.Systems.Scoring;
using WafersPlease.UI;

namespace WafersPlease.Interaction
{
    /// <summary>
    /// Persistent on-screen HUD. Shows the day/phase, wafer progress, live salary,
    /// accuracy, a color-coded competency bar, and a contextual objective prompt.
    /// Built entirely from the shared <see cref="UITheme"/> so it stays consistent
    /// with the rest of the UI and needs no authored art.
    /// </summary>
    public class ShiftBoardController : MonoBehaviour
    {
        GameFlowController flow;
        DayProgressionController progression;
        ScoreManager score;
        Canvas canvas;

        Text dayText;
        Text phaseText;
        Text waferText;
        Text salaryText;
        Text accuracyText;
        Text competencyLabel;
        Image competencyFill;
        Image waferFill;
        Text objectiveText;
        Image objectivePanel;

        Image brakePanel;
        Text brakeText;

        float refreshTimer;
        int lastSalary;
        float salaryPulse;
        float objectivePulse;

        void Start()
        {
            flow = FindAnyObjectByType<GameFlowController>();
            progression = FindAnyObjectByType<DayProgressionController>();
            score = FindAnyObjectByType<ScoreManager>();
            BuildHUD();
        }

        void BuildHUD()
        {
            canvas = UITheme.CreateCanvas("ShiftHUD", transform, 90);

            // ---- Top status bar -------------------------------------------------
            var bar = UITheme.Panel(canvas.transform,
                new Vector2(0.005f, 0.945f), new Vector2(0.995f, 0.995f),
                UITheme.PanelBg);

            // Accent strip on the left of the bar
            var accent = UITheme.Panel(bar.transform,
                new Vector2(0f, 0.12f), new Vector2(0.004f, 0.88f), UITheme.Accent);
            accent.raycastTarget = false;

            dayText = UITheme.Label(bar.transform, "DAY 1 / 3", 22, FontStyle.Bold,
                UITheme.Accent, new Vector2(0.012f, 0f), new Vector2(0.16f, 1f),
                TextAnchor.MiddleLeft);

            phaseText = UITheme.Label(bar.transform, "INSPECTION", 16, FontStyle.Bold,
                UITheme.TextSecondary, new Vector2(0.17f, 0f), new Vector2(0.32f, 1f),
                TextAnchor.MiddleLeft);

            // Wafer progress (label + mini bar)
            waferText = UITheme.Label(bar.transform, "WAFER 0 / 10", 16, FontStyle.Bold,
                UITheme.TextPrimary, new Vector2(0.34f, 0.45f), new Vector2(0.55f, 1f),
                TextAnchor.MiddleLeft);
            waferFill = UITheme.ProgressBar(bar.transform,
                new Vector2(0.345f, 0.18f), new Vector2(0.54f, 0.42f),
                new Color(0.18f, 0.20f, 0.26f), UITheme.Accent, 0f);

            accuracyText = UITheme.Label(bar.transform, "ACCURACY 100%", 16, FontStyle.Bold,
                UITheme.Good, new Vector2(0.57f, 0f), new Vector2(0.75f, 1f),
                TextAnchor.MiddleCenter);

            salaryText = UITheme.Label(bar.transform, "₱0", 24, FontStyle.Bold,
                UITheme.Good, new Vector2(0.76f, 0f), new Vector2(0.995f, 1f),
                TextAnchor.MiddleRight);

            // ---- Competency bar (bottom-left) ----------------------------------
            var compPanel = UITheme.Panel(canvas.transform,
                new Vector2(0.005f, 0.02f), new Vector2(0.26f, 0.075f),
                UITheme.PanelBg);

            competencyLabel = UITheme.Label(compPanel.transform, "COMPETENCY 100%", 14,
                FontStyle.Bold, UITheme.TextSecondary,
                new Vector2(0.04f, 0.5f), new Vector2(0.96f, 0.98f), TextAnchor.MiddleLeft);

            competencyFill = UITheme.ProgressBar(compPanel.transform,
                new Vector2(0.04f, 0.14f), new Vector2(0.96f, 0.46f),
                new Color(0.18f, 0.20f, 0.26f), UITheme.Good, 1f);

            // ---- CMP safety-brake indicator (bottom-right, GDD 8C) --------------
            brakePanel = UITheme.Panel(canvas.transform,
                new Vector2(0.74f, 0.02f), new Vector2(0.995f, 0.075f),
                new Color(0.10f, 0.16f, 0.20f, 0.92f));
            brakeText = UITheme.Label(brakePanel.transform, "", 14, FontStyle.Bold, UITheme.Accent,
                new Vector2(0.05f, 0f), new Vector2(0.95f, 1f), TextAnchor.MiddleCenter);
            brakePanel.gameObject.SetActive(false);

            // ---- Objective prompt (bottom-center) ------------------------------
            objectivePanel = UITheme.Panel(canvas.transform,
                new Vector2(0.34f, 0.025f), new Vector2(0.66f, 0.075f),
                new Color(0.10f, 0.14f, 0.20f, 0.92f));
            objectiveText = UITheme.Label(objectivePanel.transform, "", 16, FontStyle.Bold,
                UITheme.Accent, new Vector2(0.04f, 0f), new Vector2(0.96f, 1f),
                TextAnchor.MiddleCenter);

            // Glossary moved to the diegetic Data Slate object (DataSlateController).
        }

        void Update()
        {
            AnimatePulses();

            refreshTimer -= Time.deltaTime;
            if (refreshTimer > 0f) return;
            refreshTimer = 0.2f;

            if (flow == null || progression == null || score == null) return;

            var gm = GameManager.Instance;
            int totalDays = gm != null && gm.dayConfigs != null ? gm.dayConfigs.Length : 3;

            dayText.text = $"DAY {progression.CurrentDay} / {totalDays}";

            phaseText.text = progression.CurrentPhase switch
            {
                ShiftPhase.Briefing => "BRIEFING",
                ShiftPhase.Inspection => "INSPECTION",
                ShiftPhase.Break => "BREAK",
                ShiftPhase.Review => "REVIEW",
                ShiftPhase.EndOfDay => "END OF DAY",
                ShiftPhase.Debrief => "DEBRIEF",
                ShiftPhase.Complete => "COMPLETE",
                _ => "---"
            };

            int done = progression.WafersProcessed;
            int target = Mathf.Max(1, progression.TargetWafers);
            waferText.text = $"WAFER {Mathf.Min(done + 1, target)} / {target}";
            if (waferFill != null) waferFill.fillAmount = (float)done / target;

            // Salary with a brief green pulse when it changes.
            int salary = score.Salary;
            if (salary != lastSalary)
            {
                salaryPulse = 1f;
                lastSalary = salary;
            }
            salaryText.text = salary >= 0 ? $"₱{salary}" : $"-₱{-salary}";

            float acc = score.GetAccuracy();
            accuracyText.text = $"ACCURACY {acc:P0}";
            accuracyText.color = acc >= 0.85f ? UITheme.Good
                : acc >= 0.6f ? UITheme.Warn : UITheme.Bad;

            // Competency bar.
            float comp01 = Mathf.Clamp01(score.Competency / 100f);
            competencyLabel.text = $"COMPETENCY {score.Competency:F0}%";
            if (competencyFill != null)
            {
                competencyFill.fillAmount = comp01;
                competencyFill.color = UITheme.HealthColor(comp01);
            }

            UpdateObjective();
            UpdateBrakeIndicator();
        }

        void UpdateBrakeIndicator()
        {
            if (brakePanel == null) return;
            bool armed = ReworkState.CmpSafetyBrakeArmed;
            brakePanel.gameObject.SetActive(armed);
            if (armed)
                brakeText.text = $"\u2713 CMP BRAKE ARMED \u00b7 {ReworkState.CmpSafetyBrakeWafersRemaining} WAFERS";
        }

        void UpdateObjective()
        {
            string msg;
            Color col = UITheme.Accent;

            if (!flow.IsGameActive)
            {
                msg = "";
            }
            else if (flow.CurrentWafer == null && flow.AwaitingNextWafer)
            {
                msg = "\u25b6  Next wafer incoming\u2026";
                col = UITheme.Warn;
            }
            else if (flow.CurrentWafer == null)
            {
                msg = "\u25b6  Click the FOUP to load a wafer";
                col = UITheme.Accent;
                objectivePulse = 1f;
            }
            else
            {
                switch (flow.CurrentWafer.CurrentState)
                {
                    case WaferController.WaferState.UnderInspection:
                    case WaferController.WaferState.Idle:
                        msg = "\u25b6  Use the Console to scan the wafer";
                        break;
                    case WaferController.WaferState.AwaitingDisposition:
                        msg = "\u25b6  Stamp a decision at the Inspection Station";
                        col = UITheme.Warn;
                        break;
                    default:
                        msg = "";
                        break;
                }
            }

            objectiveText.text = msg;
            objectiveText.color = col;
            bool show = !string.IsNullOrEmpty(msg);
            if (objectivePanel != null) objectivePanel.gameObject.SetActive(show);
        }

        void AnimatePulses()
        {
            if (salaryPulse > 0f)
            {
                salaryPulse -= Time.deltaTime * 2.5f;
                float p = Mathf.Clamp01(salaryPulse);
                if (salaryText != null)
                {
                    salaryText.transform.localScale = Vector3.one * (1f + 0.18f * p);
                    salaryText.color = Color.Lerp(
                        lastSalary >= 0 ? UITheme.Good : UITheme.Bad, Color.white, p);
                }
            }
            else if (salaryText != null && salaryText.transform.localScale != Vector3.one)
            {
                salaryText.transform.localScale = Vector3.one;
                salaryText.color = lastSalary >= 0 ? UITheme.Good : UITheme.Bad;
            }

            if (objectivePulse > 0f && objectivePanel != null)
            {
                objectivePulse -= Time.deltaTime * 1.2f;
                float g = 0.5f + 0.5f * Mathf.Abs(Mathf.Sin(Time.time * 3f));
                objectivePanel.color = new Color(0.10f, 0.14f, 0.20f, 0.7f + 0.25f * g);
            }
        }
    }
}
