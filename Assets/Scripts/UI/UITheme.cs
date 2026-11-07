using UnityEngine;
using UnityEngine.UI;

namespace WafersPlease.UI
{
    /// <summary>
    /// Shared visual language for all runtime UI. Centralizes the palette, fonts,
    /// and a set of factory helpers that build consistent, polished panels, text,
    /// buttons, sliders, and progress bars. Uses only built-in resources so it
    /// works headlessly and in players with no authored art dependency.
    /// </summary>
    public static class UITheme
    {
        // ---- Palette (industrial cleanroom fab-terminal look) ----
        // Cool slate-teal backdrops with a signature cyan/amber HMI accent, tuned to
        // match a 45nm fab equipment control terminal (deep, low-glare, high-contrast).
        public static readonly Color Backdrop = new Color(0.028f, 0.040f, 0.052f, 0.97f);
        public static readonly Color PanelBg = new Color(0.072f, 0.098f, 0.122f, 0.95f);
        public static readonly Color PanelBgSolid = new Color(0.072f, 0.098f, 0.122f, 1f);
        public static readonly Color PanelBorder = new Color(0.22f, 0.52f, 0.62f, 0.70f);
        public static readonly Color CardBg = new Color(0.108f, 0.140f, 0.172f, 0.96f);
        public static readonly Color HeaderBg = new Color(0.055f, 0.078f, 0.098f, 1f);

        public static readonly Color TextPrimary = new Color(0.96f, 0.98f, 1.00f);
        public static readonly Color TextSecondary = new Color(0.78f, 0.83f, 0.90f);
        public static readonly Color TextMuted = new Color(0.62f, 0.67f, 0.74f);

        public static readonly Color Accent = new Color(0.30f, 0.78f, 0.94f);   // fab cyan
        public static readonly Color AccentDim = new Color(0.15f, 0.40f, 0.52f);
        public static readonly Color Amber = new Color(1.00f, 0.68f, 0.15f);   // HMI amber
        public static readonly Color Good = new Color(0.28f, 0.86f, 0.52f);
        public static readonly Color Warn = new Color(1.00f, 0.68f, 0.15f);
        public static readonly Color Bad = new Color(0.96f, 0.32f, 0.28f);

        static Font _font;
        public static Font Font
        {
            get
            {
                if (_font == null)
                    _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                return _font;
            }
        }

        // ---- Generated sprites (cached) ----
        static Sprite _roundedSprite;
        static Sprite _roundedBorderSprite;
        static Sprite _pillSprite;

        /// <summary>A soft rounded-rectangle sprite for panels (9-slice).</summary>
        public static Sprite RoundedRect
        {
            get
            {
                if (_roundedSprite == null)
                    _roundedSprite = BuildRoundedSprite(48, 12, false);
                return _roundedSprite;
            }
        }

        /// <summary>Rounded rect with a 2px inner border for accented panels.</summary>
        public static Sprite RoundedRectBorder
        {
            get
            {
                if (_roundedBorderSprite == null)
                    _roundedBorderSprite = BuildRoundedSprite(48, 12, true);
                return _roundedBorderSprite;
            }
        }

        /// <summary>A fully-rounded pill sprite for bars/buttons.</summary>
        public static Sprite Pill
        {
            get
            {
                if (_pillSprite == null)
                    _pillSprite = BuildRoundedSprite(32, 16, false);
                return _pillSprite;
            }
        }

        static Sprite BuildRoundedSprite(int size, int radius, bool border)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            tex.wrapMode = TextureWrapMode.Clamp;
            tex.filterMode = FilterMode.Bilinear;

            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float a = CornerAlpha(x, y, size, radius);
                    Color c = new Color(1f, 1f, 1f, a);
                    if (border)
                    {
                        float edge = EdgeDistance(x, y, size, radius);
                        // 2px inner border ring: brighten the outer 2px band
                        if (a > 0.5f && edge < 2.5f)
                            c = new Color(1f, 1f, 1f, a);
                    }
                    tex.SetPixel(x, y, c);
                }
            }
            tex.Apply();

            int b = radius + 2;
            return Sprite.Create(tex, new Rect(0, 0, size, size),
                new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect,
                new Vector4(b, b, b, b));
        }

        static float CornerAlpha(int x, int y, int size, int radius)
        {
            float fx = x + 0.5f;
            float fy = y + 0.5f;
            float cx = Mathf.Clamp(fx, radius, size - radius);
            float cy = Mathf.Clamp(fy, radius, size - radius);
            float dx = fx - cx;
            float dy = fy - cy;
            float dist = Mathf.Sqrt(dx * dx + dy * dy);
            // 1px anti-aliased edge
            return Mathf.Clamp01(radius - dist + 0.5f);
        }

        static float EdgeDistance(int x, int y, int size, int radius)
        {
            float fx = x + 0.5f;
            float fy = y + 0.5f;
            float left = fx;
            float right = size - fx;
            float bottom = fy;
            float top = size - fy;
            return Mathf.Min(Mathf.Min(left, right), Mathf.Min(bottom, top));
        }

        // ---- Factory helpers ----

        public static Canvas CreateCanvas(string name, Transform parent, int sortingOrder)
        {
            var go = new GameObject(name, typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            if (parent != null) go.transform.SetParent(parent, false);
            var canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = sortingOrder;
            var scaler = go.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0.5f;            return canvas;
        }

        /// <summary>
        /// Builds a diegetic WORLD-SPACE canvas that floats in the 3D scene as a
        /// physical HMI screen in front of the main camera. Buttons/sliders remain
        /// interactive because the GraphicRaycaster uses the main camera as its
        /// event camera. Used to run rework minigames inside the 3D environment
        /// instead of as flat 2D overlays.
        /// </summary>
        public static Canvas CreateWorldCanvas(string name, Transform parent, int sortingOrder,
            float distance = 0.62f, float worldWidth = 0.62f, float worldHeight = 0.42f)
        {
            var go = new GameObject(name, typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            if (parent != null) go.transform.SetParent(parent, false);
            var canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            canvas.sortingOrder = sortingOrder;

            var cam = Camera.main;
            canvas.worldCamera = cam;

            var scaler = go.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize;
            scaler.dynamicPixelsPerUnit = 3f; // crisp text on the physical panel

            // Author the canvas at 1920x1080 px then scale it down to a physical panel.
            var rt = go.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(1920f, 1080f);
            float sx = worldWidth / 1920f;
            float sy = worldHeight / 1080f;
            float s = Mathf.Min(sx, sy);
            rt.localScale = new Vector3(s, s, s);

            // Position it as a screen mounted in front of the camera, facing the player.
            if (cam != null)
            {
                Vector3 pos = cam.transform.position + cam.transform.forward * distance;
                go.transform.position = pos;
                go.transform.rotation = Quaternion.LookRotation(go.transform.position - cam.transform.position, cam.transform.up);
            }

            // A subtle physical bezel/back so the panel reads as an object, not floating UI.
            var bezel = new GameObject("Bezel", typeof(Image));
            bezel.transform.SetParent(go.transform, false);
            var bimg = bezel.GetComponent<Image>();
            bimg.color = new Color(0.03f, 0.045f, 0.06f, 1f);
            bimg.sprite = RoundedRect; bimg.type = Image.Type.Sliced; bimg.pixelsPerUnitMultiplier = 1f;
            var brt = bezel.GetComponent<RectTransform>();
            brt.anchorMin = Vector2.zero; brt.anchorMax = Vector2.one;
            brt.offsetMin = new Vector2(-28, -28); brt.offsetMax = new Vector2(28, 28);
            bezel.transform.SetAsFirstSibling();

            return canvas;
        }

        public static RectTransform Anchor(GameObject go, Vector2 min, Vector2 max)
        {
            var rt = go.GetComponent<RectTransform>();
            if (rt == null) rt = go.AddComponent<RectTransform>();
            rt.anchorMin = min;
            rt.anchorMax = max;
            rt.sizeDelta = Vector2.zero;
            rt.anchoredPosition = Vector2.zero;
            return rt;
        }

        public static Image Panel(Transform parent, Vector2 min, Vector2 max, Color color, bool rounded = true)
        {
            var go = new GameObject("Panel", typeof(Image));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>();
            img.color = color;
            if (rounded)
            {
                img.sprite = RoundedRect;
                img.type = Image.Type.Sliced;
                img.pixelsPerUnitMultiplier = 1f;
            }
            Anchor(go, min, max);
            return img;
        }

        /// <summary>
        /// Builds a framed "fab terminal" panel: a solid body with a subtle accent
        /// border ring and a header strip carrying a title (industrial HMI look).
        /// Returns the body Image; add children to it as the content area.
        /// </summary>
        public static Image TerminalPanel(Transform parent, Vector2 min, Vector2 max,
            string title, Color accent, Color body)
        {
            // Border ring (slightly larger, accent-tinted) sits behind the body.
            var ring = Panel(parent, min, max, new Color(accent.r, accent.g, accent.b, 0.55f));
            ring.gameObject.name = "PanelBorder";
            ring.raycastTarget = false;

            // Body inset by a couple px so the ring reads as a 1-2px border.
            var bodyGo = new GameObject("PanelBody", typeof(Image));
            bodyGo.transform.SetParent(ring.transform, false);
            var bodyImg = bodyGo.GetComponent<Image>();
            bodyImg.color = body;
            bodyImg.sprite = RoundedRect;
            bodyImg.type = Image.Type.Sliced;
            bodyImg.pixelsPerUnitMultiplier = 1f;
            var brt = bodyGo.GetComponent<RectTransform>();
            brt.anchorMin = Vector2.zero; brt.anchorMax = Vector2.one;
            brt.offsetMin = new Vector2(2, 2); brt.offsetMax = new Vector2(-2, -2);

            // Header strip across the top of the body.
            var header = Panel(bodyImg.transform, new Vector2(0f, 0.90f), new Vector2(1f, 1f), HeaderBg);
            header.raycastTarget = false;
            // Accent underline beneath the header.
            var underline = Panel(bodyImg.transform, new Vector2(0f, 0.895f), new Vector2(1f, 0.90f), accent);
            underline.raycastTarget = false;
            // Header title + a small accent tick on the left (HMI status dot).
            var dot = Panel(header.transform, new Vector2(0.015f, 0.32f), new Vector2(0.03f, 0.68f), accent);
            dot.raycastTarget = false;
            if (!string.IsNullOrEmpty(title))
                Label(header.transform, title, 16, FontStyle.Bold, accent,
                    new Vector2(0.045f, 0f), new Vector2(0.97f, 1f), TextAnchor.MiddleLeft);

            return bodyImg;
        }

        /// <summary>A thin horizontal divider line (accent-tinted, low alpha).</summary>
        public static Image Divider(Transform parent, float yMin, float yMax, Color color)
        {
            var d = Panel(parent, new Vector2(0.04f, yMin), new Vector2(0.96f, yMax),
                new Color(color.r, color.g, color.b, 0.35f));
            d.raycastTarget = false;
            return d;
        }

        
public static Image FullBackdrop(Transform parent, Color color)
        {
            var go = new GameObject("Backdrop", typeof(Image));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>();
            img.color = color;
            img.raycastTarget = true;
            Anchor(go, Vector2.zero, Vector2.one);
            return img;
        }

        // ---- Readability ----
        // Global scale + floor applied to all factory-built text so the whole UI
        // stays legible. Callers pass their original sizes; these keep small labels
        // from dropping below a readable threshold and gently enlarge everything.
        public const float FontScale = 1.18f;
        public const int MinFontSize = 15;

        /// <summary>Applies the global readability scale and minimum-size floor.</summary>
        public static int Scaled(int size)
        {
            int s = Mathf.RoundToInt(size * FontScale);
            return Mathf.Max(MinFontSize, s);
        }

        public static Text Label(Transform parent, string text, int size, FontStyle style, Color color,
            Vector2 min, Vector2 max, TextAnchor align = TextAnchor.MiddleCenter)
        {
            var go = new GameObject("Label", typeof(Text));
            go.transform.SetParent(parent, false);
            var t = go.GetComponent<Text>();
            t.font = Font;
            t.text = text;
            t.fontSize = Scaled(size);
            t.fontStyle = style;
            t.alignment = align;
            t.color = color;
            t.raycastTarget = false;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            Anchor(go, min, max);
            return t;
        }

        public static Button Button(Transform parent, string label, Color baseColor,
            Vector2 min, Vector2 max, UnityEngine.Events.UnityAction onClick, int fontSize = 22)
        {
            var go = new GameObject(label + "Btn", typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);

            var img = go.GetComponent<Image>();
            img.color = baseColor;
            img.sprite = RoundedRect;
            img.type = Image.Type.Sliced;
            img.pixelsPerUnitMultiplier = 1f;

            var btn = go.GetComponent<Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(onClick);
            var cb = btn.colors;
            cb.normalColor = Color.white;
            cb.highlightedColor = new Color(1.18f, 1.18f, 1.18f, 1f);
            cb.pressedColor = new Color(0.8f, 0.8f, 0.8f, 1f);
            cb.selectedColor = Color.white;
            cb.fadeDuration = 0.12f;
            btn.colors = cb;

            Anchor(go, min, max);

            // Thin accent underline gives the button a tactile HMI edge.
            var edge = new GameObject("BtnEdge", typeof(Image));
            edge.transform.SetParent(go.transform, false);
            var edgeImg = edge.GetComponent<Image>();
            edgeImg.color = new Color(1f, 1f, 1f, 0.22f);
            edgeImg.sprite = RoundedRect; edgeImg.type = Image.Type.Sliced;
            edgeImg.raycastTarget = false;
            var ert = edge.GetComponent<RectTransform>();
            ert.anchorMin = new Vector2(0.08f, 0.04f); ert.anchorMax = new Vector2(0.92f, 0.11f);
            ert.offsetMin = Vector2.zero; ert.offsetMax = Vector2.zero;

            var lbl = Label(go.transform, label, fontSize, FontStyle.Bold, Color.white,
                Vector2.zero, Vector2.one);
            lbl.raycastTarget = false;

            return btn;
        }

        /// <summary>
        /// Builds a labeled horizontal progress bar. Returns the fill Image so callers
        /// can update fillAmount and color. The fill uses Image.Type.Filled (Horizontal).
        /// </summary>
        public static Image ProgressBar(Transform parent, Vector2 min, Vector2 max,
            Color trackColor, Color fillColor, float value01)
        {
            var track = new GameObject("BarTrack", typeof(Image));
            track.transform.SetParent(parent, false);
            var trackImg = track.GetComponent<Image>();
            trackImg.color = trackColor;
            trackImg.sprite = Pill;
            trackImg.type = Image.Type.Sliced;
            trackImg.pixelsPerUnitMultiplier = 1f;
            trackImg.raycastTarget = false;
            Anchor(track, min, max);

            var fill = new GameObject("BarFill", typeof(Image));
            fill.transform.SetParent(track.transform, false);
            var fillImg = fill.GetComponent<Image>();
            fillImg.color = fillColor;
            fillImg.sprite = Pill;
            fillImg.type = Image.Type.Filled;
            fillImg.fillMethod = Image.FillMethod.Horizontal;
            fillImg.fillOrigin = 0;
            fillImg.fillAmount = Mathf.Clamp01(value01);
            fillImg.raycastTarget = false;
            var frt = fill.GetComponent<RectTransform>();
            frt.anchorMin = Vector2.zero;
            frt.anchorMax = Vector2.one;
            frt.offsetMin = new Vector2(2, 2);
            frt.offsetMax = new Vector2(-2, -2);

            return fillImg;
        }

        /// <summary>Interpolated competency color: red -> amber -> green.</summary>
        public static Color HealthColor(float value01)
        {
            value01 = Mathf.Clamp01(value01);
            if (value01 < 0.5f)
                return Color.Lerp(Bad, Warn, value01 / 0.5f);
            return Color.Lerp(Warn, Good, (value01 - 0.5f) / 0.5f);
        }

        public static string Hex(Color c)
        {
            return ColorUtility.ToHtmlStringRGB(c);
        }
    }
}
