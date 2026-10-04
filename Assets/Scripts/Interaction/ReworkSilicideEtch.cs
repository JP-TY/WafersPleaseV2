using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using WafersPlease.Config;
using WafersPlease.UI;

namespace WafersPlease.Interaction
{
    /// <summary>
    /// Selective silicide wet etch (GDD 8B). Titanium silicide anneals through two
    /// phases: the intermediate high-resistance C49 phase, then the final low-resistance
    /// C54 phase. The operator must fire the ULTRASONIC AGITATION WASH while the film is
    /// still in C49 — this strips the stray Ti stringers that would otherwise be locked
    /// in as a permanent gate/source-drain bridge once the lattice snaps to C54.
    ///
    /// The console shows a live sheet-resistance trace (Rs) falling as the anneal
    /// proceeds: a high C49 plateau, a fast transition ramp, then a low C54 plateau.
    /// Firing during C49 succeeds; firing during the transition is marginal; waiting
    /// until C54 locks the bridge -> scrap.
    /// </summary>
    public class ReworkSilicideEtch : MonoBehaviour
    {
        float c49Duration = 12f;        // high-Rs window (easier)
        float transitionDuration = 4.5f; // more forgiving transition (easier)

        Canvas canvas;
        Image card;
        RawImage scopeImage;
        Texture2D scopeTex;
        Text phaseText, rsText, statusText;
        Image phaseBadge;
        Button washBtn;

        float elapsed;
        float totalAnneal;
        bool active;
        bool resolved;
        System.Action<bool> onComplete;

        const int TexW = 360;
        const int TexH = 150;
        const float RsC49 = 0.85f;   // normalized high sheet resistance
        const float RsC54 = 0.20f;   // normalized low sheet resistance

        enum Phase { C49, Transition, C54 }

        public void StartMinigame(DefectProfileSO defect, System.Action<bool> complete)
        {
            onComplete = complete;

            ReworkTutorial.Show(transform, "SELECTIVE SILICIDE WET ETCH",
                "Strip the stray titanium stringers before the silicide film anneals to its locked C54 phase. " +
                "You must act during the high-resistance C49 phase (green badge).",
                new string[]
                {
                    "Watch the phase badge and the falling sheet-resistance (Rs) trace.",
                    "While the badge reads C49 PHASE (green), press TRIGGER ULTRASONIC WASH.",
                    "The green shaded region of the scope is the safe C49 window.",
                    "Firing during the amber transition or after C54 locks the bridge = scrap.",
                },
                () => Begin(defect));
        }

        void Begin(DefectProfileSO defect)
        {
            active = true;
            resolved = false;
            elapsed = 0f;

            Random.InitState(defect.displayName.GetHashCode());
            c49Duration = Random.Range(10f, 14f);
            totalAnneal = c49Duration + transitionDuration + 3f;

            BuildUI();
        }

        void BuildUI()
        {
            canvas = UITheme.CreateCanvas("ReworkSilicideCanvas", transform, 120);
            UITheme.FullBackdrop(canvas.transform, UITheme.Backdrop);

            card = UITheme.Panel(canvas.transform,
                new Vector2(0.18f, 0.14f), new Vector2(0.82f, 0.88f), UITheme.PanelBgSolid);
            var accent = UITheme.Panel(card.transform,
                new Vector2(0.04f, 0.92f), new Vector2(0.96f, 0.94f), UITheme.Accent);
            accent.raycastTarget = false;

            UITheme.Label(card.transform, "SELECTIVE SILICIDE WET ETCH", 24, FontStyle.Bold, UITheme.Accent,
                new Vector2(0.04f, 0.84f), new Vector2(0.96f, 0.92f));
            UITheme.Label(card.transform,
                "Fire the ultrasonic wash during the high-resistance C49 phase.\n" +
                "Once the film anneals to C54, the Ti bridge locks permanently.",
                14, FontStyle.Normal, UITheme.TextSecondary,
                new Vector2(0.06f, 0.75f), new Vector2(0.94f, 0.84f));

            // sheet-resistance scope
            var frame = UITheme.Panel(card.transform,
                new Vector2(0.08f, 0.4f), new Vector2(0.92f, 0.72f), new Color(0.05f, 0.06f, 0.09f));
            frame.raycastTarget = false;
            UITheme.Label(card.transform, "SHEET RESISTANCE  R\u209b  (\u03a9/\u25a1)", 12, FontStyle.Bold,
                UITheme.TextSecondary, new Vector2(0.08f, 0.72f), new Vector2(0.5f, 0.75f), TextAnchor.MiddleLeft);

            var scopeGo = new GameObject("Scope", typeof(RawImage));
            scopeGo.transform.SetParent(frame.transform, false);
            scopeImage = scopeGo.GetComponent<RawImage>();
            scopeImage.raycastTarget = false;
            var srt = scopeGo.GetComponent<RectTransform>();
            srt.anchorMin = Vector2.zero; srt.anchorMax = Vector2.one;
            srt.offsetMin = new Vector2(6, 6); srt.offsetMax = new Vector2(-6, -6);
            scopeTex = new Texture2D(TexW, TexH, TextureFormat.RGBA32, false);
            scopeImage.texture = scopeTex;

            // phase badge
            phaseBadge = UITheme.Panel(card.transform,
                new Vector2(0.36f, 0.28f), new Vector2(0.64f, 0.36f), UITheme.Good);
            phaseBadge.raycastTarget = false;
            phaseText = UITheme.Label(phaseBadge.transform, "C49 PHASE", 20, FontStyle.Bold, Color.white,
                Vector2.zero, Vector2.one);

            rsText = UITheme.Label(card.transform, "", 14, FontStyle.Bold, UITheme.TextPrimary,
                new Vector2(0.66f, 0.72f), new Vector2(0.92f, 0.75f), TextAnchor.MiddleRight);

            statusText = UITheme.Label(card.transform, "Annealing\u2026 stand by for C49 window", 15,
                FontStyle.Bold, UITheme.Warn, new Vector2(0.06f, 0.2f), new Vector2(0.94f, 0.26f));

            washBtn = UITheme.Button(card.transform, "\u26a1 TRIGGER ULTRASONIC WASH",
                new Color(0.16f, 0.42f, 0.58f),
                new Vector2(0.28f, 0.06f), new Vector2(0.72f, 0.16f), OnWash, 18);
        }

        Phase CurrentPhase()
        {
            if (elapsed < c49Duration) return Phase.C49;
            if (elapsed < c49Duration + transitionDuration) return Phase.Transition;
            return Phase.C54;
        }

        float CurrentRs()
        {
            switch (CurrentPhase())
            {
                case Phase.C49: return RsC49;
                case Phase.C54: return RsC54;
                default:
                    float p = (elapsed - c49Duration) / transitionDuration;
                    return Mathf.Lerp(RsC49, RsC54, Mathf.SmoothStep(0f, 1f, p));
            }
        }

        void OnWash()
        {
            if (!active || resolved) return;
            var phase = CurrentPhase();
            if (phase == Phase.C49)
            {
                statusText.text = "ULTRASONIC WASH \u2014 stray Ti stringers stripped in C49. Clean contact.";
                statusText.color = UITheme.Good;
                Resolve(true);
            }
            else if (phase == Phase.Transition)
            {
                // marginal — GDD treats the safe window as C49; transition is a near-miss fail
                statusText.text = "Fired mid-transition \u2014 partial strip, residual bridge remains.";
                statusText.color = UITheme.Bad;
                Resolve(false);
            }
            else
            {
                statusText.text = "Too late \u2014 film annealed to C54, silicide bridge locked. Scrap.";
                statusText.color = UITheme.Bad;
                Resolve(false);
            }
        }

        void Resolve(bool success)
        {
            resolved = true;
            active = false;
            if (washBtn != null) washBtn.interactable = false;
            StartCoroutine(FinishAfterFeedback(success));
        }

        IEnumerator FinishAfterFeedback(bool success)
        {
            yield return new WaitForSeconds(1.4f);
            Cleanup();
            onComplete?.Invoke(success);
        }

        void Update()
        {
            if (!active) return;
            elapsed += Time.deltaTime;

            var phase = CurrentPhase();
            if (phaseText != null)
            {
                phaseText.text = phase switch
                {
                    Phase.C49 => "C49 PHASE \u2014 ACT NOW",
                    Phase.Transition => "C49 \u2192 C54 TRANSITION",
                    _ => "C54 PHASE \u2014 LOCKED"
                };
            }
            if (phaseBadge != null)
            {
                phaseBadge.color = phase switch
                {
                    Phase.C49 => UITheme.Good,
                    Phase.Transition => UITheme.Warn,
                    _ => UITheme.Bad
                };
            }
            if (rsText != null)
                rsText.text = $"R\u209b = {Mathf.RoundToInt(Mathf.Lerp(4f, 18f, 1f - CurrentRs()))} \u03a9/\u25a1";

            DrawScope();

            if (phase == Phase.C54 && !resolved)
            {
                // player never acted -> bridge locks
                statusText.text = "No wash fired \u2014 C54 locked the silicide bridge. Scrap.";
                statusText.color = UITheme.Bad;
                Resolve(false);
            }
        }

        void DrawScope()
        {
            Color bg = new Color(0.04f, 0.05f, 0.08f);
            Color grid = new Color(0.11f, 0.15f, 0.19f);
            Color c49Band = new Color(UITheme.Good.r, UITheme.Good.g, UITheme.Good.b, 1f);

            float c49Frac = c49Duration / totalAnneal;

            for (int y = 0; y < TexH; y++)
                for (int x = 0; x < TexW; x++)
                {
                    // faint green shading over the C49 (actionable) region
                    float xf = (float)x / TexW;
                    Color b = (x % 36 == 0 || y % 30 == 0) ? grid : bg;
                    if (xf <= c49Frac)
                        b = Color.Lerp(b, new Color(c49Band.r * 0.25f, c49Band.g * 0.25f, c49Band.b * 0.25f), 0.5f);
                    scopeTex.SetPixel(x, y, b);
                }

            // Rs trace across the full anneal timeline
            int prevY = -1;
            Color line = UITheme.Accent;
            for (int x = 0; x < TexW; x++)
            {
                float tt = (float)x / TexW * totalAnneal;
                float rs = RsAtTime(tt);
                int py = Mathf.Clamp(Mathf.RoundToInt(rs * (TexH - 6)) + 3, 1, TexH - 2);
                int lo = prevY < 0 ? py : Mathf.Min(prevY, py);
                int hi = prevY < 0 ? py : Mathf.Max(prevY, py);
                for (int yy = lo; yy <= hi; yy++)
                {
                    scopeTex.SetPixel(x, yy, line);
                    if (x > 0) scopeTex.SetPixel(x - 1, yy, line);
                }
                prevY = py;
            }

            // live playhead
            int headX = Mathf.Clamp(Mathf.RoundToInt(elapsed / totalAnneal * TexW), 0, TexW - 1);
            for (int y = 0; y < TexH; y++)
                scopeTex.SetPixel(headX, y, UITheme.Warn);

            scopeTex.Apply();
        }

        float RsAtTime(float t)
        {
            if (t < c49Duration) return RsC49;
            if (t < c49Duration + transitionDuration)
            {
                float p = (t - c49Duration) / transitionDuration;
                return Mathf.Lerp(RsC49, RsC54, Mathf.SmoothStep(0f, 1f, p));
            }
            return RsC54;
        }

        void Cleanup()
        {
            active = false;
            if (canvas != null) Destroy(canvas.gameObject);
        }
    }
}
