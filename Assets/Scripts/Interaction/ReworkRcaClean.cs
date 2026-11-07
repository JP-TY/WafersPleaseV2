using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using WafersPlease.Config;
using WafersPlease.UI;

namespace WafersPlease.Interaction
{
    /// <summary>
    /// RCA-Clean wet bench (GDD 8A). A realistic, sequential two-tank procedure:
    ///   SC-1 : heated ALKALINE bath (NH4OH + H2O2) that lifts organic surface films.
    ///   SC-2 : ACIDIC bath (HCl + H2O2) that strips residual heavy-metal ions.
    /// For each bath the operator must (1) bring the tank to the correct temperature
    /// band and (2) soak the wafer for the correct dwell time — lowering the wafer in
    /// and raising it out. Under-soak leaves active impurities; over-soak attacks the
    /// substrate boundary. The stages are strictly ordered SC-1 then SC-2.
    /// </summary>
    public class ReworkRcaClean : MonoBehaviour
    {
        float tempTolerance = 20f;     // +/- degrees C accepted (easier)
        float dwellTolerance = 4.5f;   // +/- seconds accepted (easier)

        Canvas canvas;
        Image card;

        // Tank visuals
        Image sc1Liquid, sc2Liquid;
        Image sc1Glow, sc2Glow;
        RectTransform waferIcon;
        Image tempFill;
        Text tempReadout, stageTitle, instruction, dwellReadout;
        Image dwellFill, dwellWindow;
        Button actionBtn;
        Text actionLabel;
        Slider heaterSlider;

        // Recipe (per stage): target temperature (C) and target dwell (s)
        struct Recipe { public float temp; public float dwell; public string name; public string chem; public Color tint; }
        Recipe[] recipes;
        int stage;              // 0 = SC-1, 1 = SC-2
        float bathTemp = 22f;   // starts at room temperature
        float dwell;            // current soak time
        bool soaking;
        bool stageFailed;
        bool resolved;
        bool active;
        System.Action<bool> onComplete;

        void Confirmations() { if (stageFailed) { } }

        public void StartMinigame(DefectProfileSO defect, System.Action<bool> complete)
        {
            onComplete = complete;

            ReworkTutorial.Show(transform, "RCA WET-CLEAN BENCH",
                "Salvage the wafer by running it through both cleaning baths in order (SC-1 then SC-2). " +
                "Each bath must be heated to its target temperature, then the wafer soaked for the target time.",
                new string[]
                {
                    "Drag the TANK HEATER slider to reach the target temperature (green readout).",
                    "Press LOWER WAFER to start the soak; the green band shows the safe dwell window.",
                    "Press RAISE WAFER while inside the green window to pass the stage.",
                    "Too cold / under-soak leaves residue; too hot / over-soak damages the wafer.",
                },
                () => Begin(defect));
        }

        void Begin(DefectProfileSO defect)
        {
            active = true;
            resolved = false;
            stage = 0;
            bathTemp = 22f;
            dwell = 0f;
            soaking = false;
            stageFailed = false;

            Random.InitState(defect.displayName.GetHashCode());
            recipes = new Recipe[2];
            recipes[0] = new Recipe
            {
                name = "SC-1  STANDARD CLEAN 1",
                chem = "NH\u2084OH : H\u2082O\u2082 : H\u2082O  (alkaline, heated)",
                temp = Mathf.Round(Random.Range(70f, 80f)),   // classic ~75 C
                dwell = Mathf.Round(Random.Range(6f, 9f)),
                tint = new Color(0.35f, 0.55f, 0.85f)          // bluish alkaline
            };
            recipes[1] = new Recipe
            {
                name = "SC-2  STANDARD CLEAN 2",
                chem = "HCl : H\u2082O\u2082 : H\u2082O  (acidic)",
                temp = Mathf.Round(Random.Range(70f, 80f)),
                dwell = Mathf.Round(Random.Range(5f, 8f)),
                tint = new Color(0.85f, 0.65f, 0.35f)          // amber acidic
            };

            BuildUI();
            RefreshStage();
        }

        void BuildUI()
        {
            canvas = UITheme.CreateCanvas("ReworkRcaCanvas", transform, 120);
            UITheme.FullBackdrop(canvas.transform, UITheme.Backdrop);

            card = UITheme.Panel(canvas.transform,
                new Vector2(0.16f, 0.1f), new Vector2(0.84f, 0.92f), UITheme.PanelBgSolid);
            var accent = UITheme.Panel(card.transform,
                new Vector2(0.04f, 0.93f), new Vector2(0.96f, 0.95f), UITheme.Accent);
            accent.raycastTarget = false;

            UITheme.Label(card.transform, "RCA WET-CLEAN BENCH", 26, FontStyle.Bold, UITheme.Accent,
                new Vector2(0.04f, 0.86f), new Vector2(0.96f, 0.93f));
            stageTitle = UITheme.Label(card.transform, "", 18, FontStyle.Bold, UITheme.TextPrimary,
                new Vector2(0.04f, 0.80f), new Vector2(0.96f, 0.86f));
            instruction = UITheme.Label(card.transform, "", 15, FontStyle.Normal, UITheme.TextSecondary,
                new Vector2(0.06f, 0.74f), new Vector2(0.94f, 0.80f));

            BuildTanks();
            BuildHeater();
            BuildDwell();

            actionBtn = UITheme.Button(card.transform, "LOWER WAFER", UITheme.AccentDim,
                new Vector2(0.34f, 0.06f), new Vector2(0.66f, 0.15f), OnAction, 20);
            actionLabel = actionBtn.GetComponentInChildren<Text>();
        }

        void BuildTanks()
        {
            // Two glass vessels side by side; the wafer icon parks above the active one.
            sc1Liquid = BuildTank("SC-1", new Vector2(0.1f, 0.30f), new Vector2(0.34f, 0.66f),
                out sc1Glow);
            sc2Liquid = BuildTank("SC-2", new Vector2(0.66f, 0.30f), new Vector2(0.9f, 0.66f),
                out sc2Glow);

            var waferGo = new GameObject("Wafer", typeof(Image));
            waferGo.transform.SetParent(card.transform, false);
            var wImg = waferGo.GetComponent<Image>();
            wImg.color = new Color(0.72f, 0.78f, 0.86f);
            wImg.sprite = UITheme.Pill;
            wImg.type = Image.Type.Sliced;
            wImg.raycastTarget = false;
            waferIcon = UITheme.Anchor(waferGo, new Vector2(0.17f, 0.70f), new Vector2(0.27f, 0.735f));
        }

        Image BuildTank(string label, Vector2 min, Vector2 max, out Image glow)
        {
            var vessel = UITheme.Panel(card.transform, min, max, new Color(0.10f, 0.13f, 0.18f));
            vessel.raycastTarget = false;

            glow = UITheme.Panel(vessel.transform, new Vector2(-0.04f, -0.03f), new Vector2(1.04f, 1.03f),
                new Color(0, 0, 0, 0));
            glow.raycastTarget = false;
            glow.transform.SetAsFirstSibling();

            // liquid fill (bottom ~72% of the vessel)
            var liquid = UITheme.Panel(vessel.transform, new Vector2(0.06f, 0.05f), new Vector2(0.94f, 0.72f),
                new Color(0.3f, 0.5f, 0.8f, 0.85f));
            liquid.raycastTarget = false;

            UITheme.Label(vessel.transform, label, 15, FontStyle.Bold, UITheme.TextSecondary,
                new Vector2(0f, 0.78f), new Vector2(1f, 0.98f));
            return liquid;
        }

        void BuildHeater()
        {
            UITheme.Label(card.transform, "TANK HEATER", 13, FontStyle.Bold, UITheme.TextSecondary,
                new Vector2(0.4f, 0.62f), new Vector2(0.6f, 0.66f));

            heaterSlider = BuildSlider(new Vector2(0.4f, 0.56f), new Vector2(0.6f, 0.60f));
            heaterSlider.minValue = 22f;
            heaterSlider.maxValue = 95f;
            heaterSlider.value = 22f;

            // vertical temperature gauge
            var gaugeTrack = UITheme.Panel(card.transform,
                new Vector2(0.44f, 0.30f), new Vector2(0.48f, 0.52f),
                new Color(0.16f, 0.18f, 0.24f));
            gaugeTrack.raycastTarget = false;
            var fillGo = new GameObject("TempFill", typeof(Image));
            fillGo.transform.SetParent(gaugeTrack.transform, false);
            tempFill = fillGo.GetComponent<Image>();
            tempFill.color = UITheme.Warn;
            tempFill.sprite = UITheme.Pill;
            tempFill.type = Image.Type.Filled;
            tempFill.fillMethod = Image.FillMethod.Vertical;
            tempFill.fillOrigin = 0;
            tempFill.raycastTarget = false;
            var frt = fillGo.GetComponent<RectTransform>();
            frt.anchorMin = Vector2.zero; frt.anchorMax = Vector2.one;
            frt.offsetMin = new Vector2(2, 2); frt.offsetMax = new Vector2(-2, -2);

            tempReadout = UITheme.Label(card.transform, "22\u00b0C", 15, FontStyle.Bold, UITheme.TextPrimary,
                new Vector2(0.5f, 0.38f), new Vector2(0.62f, 0.44f), TextAnchor.MiddleLeft);
        }

        void BuildDwell()
        {
            UITheme.Label(card.transform, "SOAK DWELL", 13, FontStyle.Bold, UITheme.TextSecondary,
                new Vector2(0.06f, 0.2f), new Vector2(0.3f, 0.24f), TextAnchor.MiddleLeft);

            var track = UITheme.Panel(card.transform,
                new Vector2(0.06f, 0.16f), new Vector2(0.94f, 0.19f),
                new Color(0.16f, 0.18f, 0.24f));
            track.raycastTarget = false;

            // acceptable dwell window marker (green band) — set in RefreshStage
            var win = new GameObject("DwellWindow", typeof(Image));
            win.transform.SetParent(track.transform, false);
            dwellWindow = win.GetComponent<Image>();
            dwellWindow.color = new Color(UITheme.Good.r, UITheme.Good.g, UITheme.Good.b, 0.4f);
            dwellWindow.raycastTarget = false;

            var fillGo = new GameObject("DwellFill", typeof(Image));
            fillGo.transform.SetParent(track.transform, false);
            dwellFill = fillGo.GetComponent<Image>();
            dwellFill.color = UITheme.Accent;
            dwellFill.sprite = UITheme.Pill;
            dwellFill.type = Image.Type.Filled;
            dwellFill.fillMethod = Image.FillMethod.Horizontal;
            dwellFill.fillOrigin = 0;
            dwellFill.fillAmount = 0f;
            dwellFill.raycastTarget = false;
            var dfr = fillGo.GetComponent<RectTransform>();
            dfr.anchorMin = Vector2.zero; dfr.anchorMax = Vector2.one;
            dfr.offsetMin = new Vector2(2, 2); dfr.offsetMax = new Vector2(-2, -2);

            dwellReadout = UITheme.Label(card.transform, "0.0s", 14, FontStyle.Bold, UITheme.TextPrimary,
                new Vector2(0.06f, 0.2f), new Vector2(0.94f, 0.24f), TextAnchor.MiddleRight);
        }

        Slider BuildSlider(Vector2 min, Vector2 max)
        {
            var trackGo = new GameObject("Heater", typeof(Image), typeof(Slider));
            trackGo.transform.SetParent(card.transform, false);
            var trackImg = trackGo.GetComponent<Image>();
            trackImg.color = new Color(0.16f, 0.18f, 0.24f);
            trackImg.sprite = UITheme.Pill;
            trackImg.type = Image.Type.Sliced;
            UITheme.Anchor(trackGo, min, max);

            var slider = trackGo.GetComponent<Slider>();
            slider.direction = Slider.Direction.LeftToRight;
            slider.targetGraphic = trackImg;

            var fillArea = new GameObject("Fill", typeof(Image));
            fillArea.transform.SetParent(trackGo.transform, false);
            var fillImg = fillArea.GetComponent<Image>();
            fillImg.color = UITheme.Warn;
            fillImg.sprite = UITheme.Pill;
            fillImg.type = Image.Type.Sliced;
            var frt = fillArea.GetComponent<RectTransform>();
            frt.anchorMin = Vector2.zero; frt.anchorMax = Vector2.one;
            frt.offsetMin = new Vector2(2, 2); frt.offsetMax = new Vector2(-2, -2);
            slider.fillRect = frt;

            var handle = new GameObject("Handle", typeof(Image));
            handle.transform.SetParent(trackGo.transform, false);
            var hImg = handle.GetComponent<Image>();
            hImg.color = Color.white;
            hImg.sprite = UITheme.Pill;
            hImg.type = Image.Type.Sliced;
            var hrt = handle.GetComponent<RectTransform>();
            hrt.sizeDelta = new Vector2(18, 22);
            slider.handleRect = hrt;

            return slider;
        }

        void RefreshStage()
        {
            var r = recipes[stage];
            stageTitle.text = $"STAGE {stage + 1} / 2 \u2014 {r.name}";
            instruction.text =
                $"{r.chem}\nHeat the tank to {r.temp:F0}\u00b0C, then soak {r.dwell:F0}s.  " +
                (stage == 0 ? "Lifts organic films." : "Strips heavy-metal ions.");

            // color the active tank liquid, dim the other
            if (sc1Liquid != null)
                sc1Liquid.color = stage == 0 ? recipes[0].tint : new Color(0.2f, 0.25f, 0.32f, 0.6f);
            if (sc2Liquid != null)
                sc2Liquid.color = stage == 1 ? recipes[1].tint : new Color(0.2f, 0.25f, 0.32f, 0.6f);

            // park wafer above the active tank
            float wx = stage == 0 ? 0.17f : 0.73f;
            if (waferIcon != null)
            {
                waferIcon.anchorMin = new Vector2(wx, 0.70f);
                waferIcon.anchorMax = new Vector2(wx + 0.10f, 0.735f);
            }

            // dwell window marker positions (relative to a 2x-target track length)
            float trackMax = r.dwell * 2f;
            float lo = Mathf.Clamp01((r.dwell - dwellTolerance) / trackMax);
            float hi = Mathf.Clamp01((r.dwell + dwellTolerance) / trackMax);
            if (dwellWindow != null)
            {
                var mrt = dwellWindow.rectTransform;
                mrt.anchorMin = new Vector2(lo, 0f);
                mrt.anchorMax = new Vector2(hi, 1f);
                mrt.offsetMin = Vector2.zero; mrt.offsetMax = Vector2.zero;
            }

            dwell = 0f;
            soaking = false;
            if (dwellFill != null) dwellFill.fillAmount = 0f;
            if (actionLabel != null) actionLabel.text = "LOWER WAFER";
        }

        void OnAction()
        {
            if (!active || resolved) return;

            if (!soaking)
            {
                // Lower wafer -> begin soak. Requires the tank to be near temperature.
                soaking = true;
                dwell = 0f;
                if (actionLabel != null) actionLabel.text = "RAISE WAFER";
                StartCoroutine(LowerWafer());
            }
            else
            {
                // Raise wafer -> evaluate this stage.
                soaking = false;
                EvaluateStage();
            }
        }

        IEnumerator LowerWafer()
        {
            // animate the wafer dipping into the active tank
            float t = 0f;
            float startY = 0.70f;
            float endY = 0.42f;
            while (t < 0.4f && soaking)
            {
                t += Time.deltaTime;
                float y = Mathf.Lerp(startY, endY, t / 0.4f);
                if (waferIcon != null)
                {
                    float wx = waferIcon.anchorMin.x;
                    waferIcon.anchorMin = new Vector2(wx, y);
                    waferIcon.anchorMax = new Vector2(wx + 0.10f, y + 0.035f);
                }
                yield return null;
            }
        }

        void EvaluateStage()
        {
            var r = recipes[stage];
            bool tempOk = Mathf.Abs(bathTemp - r.temp) <= tempTolerance;
            bool dwellOk = Mathf.Abs(dwell - r.dwell) <= dwellTolerance;

            // raise the wafer back up
            if (waferIcon != null)
            {
                float wx = waferIcon.anchorMin.x;
                waferIcon.anchorMin = new Vector2(wx, 0.70f);
                waferIcon.anchorMax = new Vector2(wx + 0.10f, 0.735f);
            }

            if (!tempOk || !dwellOk)
            {
                stageFailed = true;
                string why = !tempOk
                    ? (bathTemp < r.temp ? "Bath too cold \u2014 residues not lifted"
                                         : "Bath overheated \u2014 substrate attacked")
                    : (dwell < r.dwell ? "Under-soaked \u2014 active impurities remain"
                                       : "Over-soaked \u2014 substrate boundary degraded");
                instruction.text = why;
                instruction.color = UITheme.Bad;
                Resolve(false);
                return;
            }

            // stage passed
            if (stage == 0)
            {
                stage = 1;
                instruction.color = UITheme.TextSecondary;
                RefreshStage();
                FlashStage(UITheme.Good, "SC-1 COMPLETE \u2014 ADVANCE TO SC-2");
            }
            else
            {
                Resolve(true);
            }
        }

        void FlashStage(Color c, string msg)
        {
            stageTitle.text = msg;
            stageTitle.color = c;
            StartCoroutine(ResetStageColor());
        }

        IEnumerator ResetStageColor()
        {
            yield return new WaitForSeconds(1.1f);
            if (stageTitle != null) stageTitle.color = UITheme.TextPrimary;
        }

        void Resolve(bool success)
        {
            resolved = true;
            active = false;
            StartCoroutine(FinishAfterFeedback(success));
        }

        IEnumerator FinishAfterFeedback(bool success)
        {
            if (stageTitle != null)
            {
                stageTitle.text = success ? "RCA CLEAN COMPLETE \u2014 WAFER SALVAGED"
                                          : "CLEAN FAILED \u2014 WAFER SCRAPPED";
                stageTitle.color = success ? UITheme.Good : UITheme.Bad;
            }
            if (card != null)
            {
                var pulse = success ? UITheme.Good : UITheme.Bad;
                float t = 0f;
                while (t < 1f)
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

            // heater lag: bath temperature eases toward the heater setpoint
            if (heaterSlider != null)
                bathTemp = Mathf.MoveTowards(bathTemp, heaterSlider.value, 45f * Time.deltaTime);

            var r = recipes[stage];
            bool tempOk = Mathf.Abs(bathTemp - r.temp) <= tempTolerance;

            if (tempReadout != null)
            {
                tempReadout.text = $"{bathTemp:F0}\u00b0C  (set {r.temp:F0})";
                tempReadout.color = tempOk ? UITheme.Good : UITheme.Warn;
            }
            if (tempFill != null)
            {
                tempFill.fillAmount = Mathf.InverseLerp(22f, 95f, bathTemp);
                tempFill.color = tempOk ? UITheme.Good : UITheme.Warn;
            }

            // active tank glow when at temperature
            var glow = stage == 0 ? sc1Glow : sc2Glow;
            if (glow != null)
            {
                float g = tempOk ? (0.25f + 0.15f * Mathf.Sin(Time.time * 4f)) : 0f;
                glow.color = new Color(UITheme.Good.r, UITheme.Good.g, UITheme.Good.b, g);
            }

            if (soaking)
            {
                dwell += Time.deltaTime;
                float trackMax = r.dwell * 2f;
                if (dwellFill != null)
                {
                    dwellFill.fillAmount = Mathf.Clamp01(dwell / trackMax);
                    bool inWindow = Mathf.Abs(dwell - r.dwell) <= dwellTolerance;
                    dwellFill.color = inWindow ? UITheme.Good : dwell > r.dwell + dwellTolerance ? UITheme.Bad : UITheme.Accent;
                }
                if (dwellReadout != null)
                    dwellReadout.text = $"{dwell:F1}s / {r.dwell:F0}s";

                // hard over-soak: let it run well past the window then auto-fail
                if (dwell > trackMax)
                {
                    soaking = false;
                    stageFailed = true;
                    instruction.text = "Over-soaked \u2014 substrate boundary degraded";
                    instruction.color = UITheme.Bad;
                    Resolve(false);
                }
            }
        }

        void Cleanup()
        {
            active = false;
            if (canvas != null) Destroy(canvas.gameObject);
        }
    }
}
