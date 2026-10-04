using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using WafersPlease.Config;
using WafersPlease.Systems.Rework;
using WafersPlease.UI;

namespace WafersPlease.Interaction
{
    /// <summary>
    /// CMP laser endpoint re-calibration (GDD 8C). A skeuomorphic oscilloscope shows the
    /// laser-interferometry reflectance endpoint trace of the CMP polisher. Planarization
    /// over-grind has drifted the sensing curve toward the thin Si3N4 stop layer; the
    /// operator re-aligns the live reflectance trace onto the reference endpoint curve by
    /// tuning DETECTOR GAIN, LASER WAVELENGTH, and PHASE. A correct lock re-arms the CMP
    /// tool's automated safety braking for the next 5 wafers (prevents downstream dishing).
    /// </summary>
    public class ReworkCmpCalibration : MonoBehaviour
    {
        float timeLimit = 40f;         // much more time (easier)
        float matchThreshold = 0.62f;  // much wider lock band (easier)

        Canvas canvas;
        Image card;
        RawImage scope;          // single overlaid scope: reference + live
        Texture2D scopeTex;
        Text timerText, matchText, statusText, lockHint;
        Image timerFill, matchFill;
        Slider gainSlider, waveSlider, phaseSlider;

        // reference (target) endpoint curve parameters
        float refGain, refWave, refPhase;

        float timeRemaining;
        bool active;
        bool resolved;
        System.Action<bool> onComplete;

        const int TexW = 460;
        const int TexH = 180;

        public void StartMinigame(DefectProfileSO defect, System.Action<bool> complete)
        {
            onComplete = complete;

            ReworkTutorial.Show(transform, "CMP LASER ENDPOINT RE-CALIBRATION",
                "Re-align the live reflectance trace (green) onto the reference endpoint curve (cyan) " +
                "before the timer runs out. A good lock re-arms the CMP safety brake for the next 5 wafers.",
                new string[]
                {
                    "Adjust DETECTOR GAIN, LASER WAVELENGTH and PHASE sliders.",
                    "Match the green trace to the cyan reference on the oscilloscope.",
                    "Watch the ENDPOINT LOCK meter climb toward 100%.",
                    "When the meter is high enough (green), press LOCK ENDPOINT.",
                },
                () => Begin(defect));
        }

        void Begin(DefectProfileSO defect)
        {
            active = true;
            resolved = false;
            timeRemaining = timeLimit;

            Random.InitState(defect.displayName.GetHashCode());
            refGain = Random.Range(0.35f, 0.85f);      // reflectance amplitude
            refWave = Random.Range(3f, 7f);            // fringe frequency (wavelength proxy)
            refPhase = Random.Range(0f, Mathf.PI * 2f);

            BuildUI();
            RedrawScope();
        }

        void BuildUI()
        {
            canvas = UITheme.CreateCanvas("ReworkCmpCanvas", transform, 120);
            UITheme.FullBackdrop(canvas.transform, UITheme.Backdrop);

            card = UITheme.Panel(canvas.transform,
                new Vector2(0.15f, 0.1f), new Vector2(0.85f, 0.92f), UITheme.PanelBgSolid);
            var accent = UITheme.Panel(card.transform,
                new Vector2(0.04f, 0.93f), new Vector2(0.96f, 0.95f), UITheme.Accent);
            accent.raycastTarget = false;

            UITheme.Label(card.transform, "CMP LASER ENDPOINT RE-CALIBRATION", 22, FontStyle.Bold, UITheme.Accent,
                new Vector2(0.04f, 0.86f), new Vector2(0.96f, 0.93f));
            UITheme.Label(card.transform,
                "Overlay the live reflectance trace (green) onto the reference endpoint (cyan).\n" +
                "A locked calibration re-arms the CMP safety brake for the next 5 wafers.",
                14, FontStyle.Normal, UITheme.TextSecondary,
                new Vector2(0.06f, 0.78f), new Vector2(0.94f, 0.86f));

            // timer
            timerFill = UITheme.ProgressBar(card.transform,
                new Vector2(0.06f, 0.735f), new Vector2(0.94f, 0.765f),
                new Color(0.18f, 0.2f, 0.26f), UITheme.Good, 1f);
            timerText = UITheme.Label(card.transform, "", 13, FontStyle.Bold, UITheme.TextPrimary,
                new Vector2(0.06f, 0.765f), new Vector2(0.94f, 0.80f), TextAnchor.MiddleRight);

            // oscilloscope
            var frame = UITheme.Panel(card.transform,
                new Vector2(0.06f, 0.42f), new Vector2(0.94f, 0.72f), new Color(0.04f, 0.06f, 0.05f));
            frame.raycastTarget = false;
            var scopeGo = new GameObject("Scope", typeof(RawImage));
            scopeGo.transform.SetParent(frame.transform, false);
            scope = scopeGo.GetComponent<RawImage>();
            scope.raycastTarget = false;
            var srt = scopeGo.GetComponent<RectTransform>();
            srt.anchorMin = Vector2.zero; srt.anchorMax = Vector2.one;
            srt.offsetMin = new Vector2(6, 6); srt.offsetMax = new Vector2(-6, -6);
            scopeTex = new Texture2D(TexW, TexH, TextureFormat.RGBA32, false);
            scope.texture = scopeTex;

            gainSlider = BuildKnob("DETECTOR GAIN", 0.1f, 1f, 0.35f);
            waveSlider = BuildKnob("LASER WAVELENGTH", 1f, 9f, 0.29f);
            phaseSlider = BuildKnob("PHASE", 0f, Mathf.PI * 2f, 0.23f);
            gainSlider.onValueChanged.AddListener(_ => RedrawScope());
            waveSlider.onValueChanged.AddListener(_ => RedrawScope());
            phaseSlider.onValueChanged.AddListener(_ => RedrawScope());

            // match meter
            UITheme.Label(card.transform, "ENDPOINT LOCK", 12, FontStyle.Bold, UITheme.TextSecondary,
                new Vector2(0.06f, 0.16f), new Vector2(0.24f, 0.2f), TextAnchor.MiddleLeft);
            matchFill = UITheme.ProgressBar(card.transform,
                new Vector2(0.24f, 0.16f), new Vector2(0.78f, 0.2f),
                new Color(0.18f, 0.2f, 0.26f), UITheme.Bad, 0f);
            matchText = UITheme.Label(card.transform, "0%", 14, FontStyle.Bold, UITheme.TextPrimary,
                new Vector2(0.79f, 0.16f), new Vector2(0.94f, 0.2f), TextAnchor.MiddleRight);

            statusText = UITheme.Label(card.transform, "", 14, FontStyle.Bold, UITheme.Warn,
                new Vector2(0.06f, 0.115f), new Vector2(0.94f, 0.15f));

            var lockBtn = UITheme.Button(card.transform, "LOCK ENDPOINT", UITheme.AccentDim,
                new Vector2(0.36f, 0.04f), new Vector2(0.64f, 0.11f), Confirm, 18);
            lockHint = lockBtn.GetComponentInChildren<Text>();
        }

        Slider BuildKnob(string label, float min, float max, float y)
        {
            UITheme.Label(card.transform, label, 12, FontStyle.Bold, UITheme.TextSecondary,
                new Vector2(0.06f, y), new Vector2(0.26f, y + 0.05f), TextAnchor.MiddleLeft);

            var trackGo = new GameObject("Knob_" + label, typeof(Image), typeof(Slider));
            trackGo.transform.SetParent(card.transform, false);
            var trackImg = trackGo.GetComponent<Image>();
            trackImg.color = new Color(0.16f, 0.18f, 0.24f);
            trackImg.sprite = UITheme.Pill;
            trackImg.type = Image.Type.Sliced;
            UITheme.Anchor(trackGo, new Vector2(0.28f, y + 0.005f), new Vector2(0.94f, y + 0.045f));

            var slider = trackGo.GetComponent<Slider>();
            slider.minValue = min; slider.maxValue = max;
            slider.direction = Slider.Direction.LeftToRight;
            slider.targetGraphic = trackImg;

            var fillArea = new GameObject("Fill", typeof(Image));
            fillArea.transform.SetParent(trackGo.transform, false);
            var fillImg = fillArea.GetComponent<Image>();
            fillImg.color = UITheme.Accent;
            fillImg.sprite = UITheme.Pill; fillImg.type = Image.Type.Sliced;
            var frt = fillArea.GetComponent<RectTransform>();
            frt.anchorMin = Vector2.zero; frt.anchorMax = Vector2.one;
            frt.offsetMin = new Vector2(2, 2); frt.offsetMax = new Vector2(-2, -2);
            slider.fillRect = frt;

            var handle = new GameObject("Handle", typeof(Image));
            handle.transform.SetParent(trackGo.transform, false);
            var hImg = handle.GetComponent<Image>();
            hImg.color = Color.white; hImg.sprite = UITheme.Pill; hImg.type = Image.Type.Sliced;
            var hrt = handle.GetComponent<RectTransform>();
            hrt.sizeDelta = new Vector2(18, 24);
            slider.handleRect = hrt;

            slider.value = Random.Range(min, max);
            return slider;
        }

        float ComputeMatch()
        {
            float dg = Mathf.Abs(gainSlider.value - refGain) / 0.9f;
            float dw = Mathf.Abs(waveSlider.value - refWave) / 8f;
            float dp = Mathf.Abs(Mathf.DeltaAngle(phaseSlider.value * Mathf.Rad2Deg,
                refPhase * Mathf.Rad2Deg)) / 180f;
            return Mathf.Clamp01(1f - (dg + dw + dp) / 3f);
        }

        void RedrawScope()
        {
            if (scopeTex == null) return;
            Color bg = new Color(0.03f, 0.05f, 0.04f);
            Color grid = new Color(0.09f, 0.16f, 0.11f);   // phosphor-green graticule
            for (int y = 0; y < TexH; y++)
                for (int x = 0; x < TexW; x++)
                    scopeTex.SetPixel(x, y, (x % 40 == 0 || y % 30 == 0) ? grid : bg);

            DrawTrace(refGain, refWave, refPhase, UITheme.Accent, 2);        // reference
            DrawTrace(gainSlider != null ? gainSlider.value : 0.5f,
                      waveSlider != null ? waveSlider.value : 4f,
                      phaseSlider != null ? phaseSlider.value : 0f,
                      UITheme.Good, 2);                                       // live
            scopeTex.Apply();

            UpdateMatchMeter();
        }

        void DrawTrace(float gain, float wave, float phase, Color color, int thickness)
        {
            int midY = TexH / 2;
            int prevY = -1;
            for (int x = 0; x < TexW; x++)
            {
                float t = (float)x / TexW;
                // reflectance endpoint: damped interferometric fringe
                float envelope = Mathf.Exp(-t * 0.6f);
                float val = Mathf.Sin(t * wave * Mathf.PI * 2f + phase) * gain * envelope;
                int py = Mathf.Clamp(midY + Mathf.RoundToInt(val * (TexH * 0.42f)), 1, TexH - 2);
                int lo = prevY < 0 ? py : Mathf.Min(prevY, py);
                int hi = prevY < 0 ? py : Mathf.Max(prevY, py);
                for (int yy = lo - thickness / 2; yy <= hi + thickness / 2; yy++)
                {
                    if (yy < 0 || yy >= TexH) continue;
                    scopeTex.SetPixel(x, yy, color);
                }
                prevY = py;
            }
        }

        void UpdateMatchMeter()
        {
            if (matchFill == null) return;
            float m = ComputeMatch();
            matchFill.fillAmount = m;
            matchFill.color = UITheme.HealthColor(m);
            if (matchText != null)
            {
                matchText.text = $"{m:P0}";
                matchText.color = m >= matchThreshold ? UITheme.Good : UITheme.TextPrimary;
            }
            if (statusText != null && !resolved)
            {
                statusText.text = m >= matchThreshold
                    ? "Endpoint aligned \u2014 ready to lock"
                    : "Drifting off Si\u2083N\u2084 stop layer \u2014 keep tuning";
                statusText.color = m >= matchThreshold ? UITheme.Good : UITheme.Warn;
            }
        }

        void Confirm()
        {
            if (!active || resolved) return;
            Resolve(ComputeMatch() >= matchThreshold);
        }

        void Resolve(bool success)
        {
            resolved = true;
            active = false;
            if (success)
            {
                ReworkState.ArmCmpSafetyBrake(5);
                if (statusText != null)
                {
                    statusText.text = "CALIBRATED \u2014 CMP safety brake armed for next 5 wafers";
                    statusText.color = UITheme.Good;
                }
            }
            else if (statusText != null)
            {
                statusText.text = "LOCK FAILED \u2014 over-grind risk, downstream dishing likely";
                statusText.color = UITheme.Bad;
            }
            StartCoroutine(FinishAfterFeedback(success));
        }

        IEnumerator FinishAfterFeedback(bool success)
        {
            if (card != null)
            {
                var pulse = success ? UITheme.Good : UITheme.Bad;
                float t = 0f;
                while (t < 1.1f)
                {
                    t += Time.deltaTime;
                    float p = Mathf.Sin(t * Mathf.PI * 3f) * 0.5f + 0.5f;
                    card.color = Color.Lerp(UITheme.PanelBgSolid,
                        new Color(pulse.r * 0.3f, pulse.g * 0.3f, pulse.b * 0.3f, 1f), p * 0.55f);
                    yield return null;
                }
            }
            Cleanup();
            onComplete?.Invoke(success);
        }

        void Update()
        {
            if (!active) return;
            timeRemaining -= Time.deltaTime;
            float f = Mathf.Clamp01(timeRemaining / timeLimit);
            if (timerText != null) timerText.text = $"{Mathf.Max(0, timeRemaining):F0}s";
            if (timerFill != null)
            {
                timerFill.fillAmount = f;
                timerFill.color = f > 0.5f ? UITheme.Good : f > 0.25f ? UITheme.Warn : UITheme.Bad;
            }
            if (timeRemaining <= 0f && !resolved)
                Resolve(false);
        }

        void Cleanup()
        {
            active = false;
            if (canvas != null) Destroy(canvas.gameObject);
        }
    }
}
