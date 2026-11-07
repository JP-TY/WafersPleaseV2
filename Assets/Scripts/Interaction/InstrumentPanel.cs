using UnityEngine;
using WafersPlease.Config;
using WafersPlease.Core;

namespace WafersPlease.Interaction
{
    public static class InstrumentPanel
    {
        static readonly float WaferRadius = 0.14f;

        public static Texture2D GenerateReadout(ToolType tool, DefectInstance[] defects, int width, int height)
        {
            return tool switch
            {
                ToolType.StylusProfilometer => ProfileChart(width, height, defects),
                ToolType.SpectroscopicEllipsometry => SpectrumWave(width, height, defects),
                ToolType.XRayRefractometry => BarSpectrum(width, height, defects),
                ToolType.ElectronMicroscope => SemImage(width, height, defects),
                ToolType.FourPointProbe => ResistanceGrid(width, height, defects),
                _ => new Texture2D(width, height, TextureFormat.RGBA32, false)
            };
        }

        static Texture2D NewBase(int w, int h)
        {
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Point;
            tex.wrapMode = TextureWrapMode.Clamp;
            Color bg = new Color(0.05f, 0.08f, 0.07f);
            Color border = new Color(0.20f, 0.45f, 0.35f);
            Color corner = new Color(0.30f, 0.70f, 0.55f);
            int b = Mathf.Max(2, w / 128);
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    bool edge = x < b || x >= w - b || y < b || y >= h - b;
                    if (edge)
                    {
                        bool tick = ((x < b * 6 || x >= w - b * 6) && (y < b * 2 || y >= h - b * 2))
                                  || ((y < b * 6 || y >= h - b * 6) && (x < b * 2 || x >= w - b * 2));
                        tex.SetPixel(x, y, tick ? corner : border);
                    }
                    else
                    {
                        float scan = (y % 3 == 0) ? 0.82f : 1f;
                        tex.SetPixel(x, y, bg * scan);
                    }
                }
            return tex;
        }

        static float DefectTexX(DefectInstance di)
        {
            return (di.localPosition.x + WaferRadius) / (WaferRadius * 2f);
        }

        static float DefectTexY(DefectInstance di)
        {
            return (di.localPosition.z + WaferRadius) / (WaferRadius * 2f);
        }

        static Texture2D ProfileChart(int w, int h, DefectInstance[] defects)
        {
            var tex = NewBase(w, h);
            Color grid = new Color(0.15f, 0.15f, 0.2f);
            Color line = new Color(0.2f, 0.8f, 1f);
            Color anomaly = new Color(1f, 0.4f, 0.2f);

            for (int y = 0; y < h; y += 20)
                for (int x = 0; x < w; x++)
                    tex.SetPixel(x, y, grid);

            for (int x = 0; x < w; x++)
            {
                float t = (float)x / w;
                float val = Mathf.Sin(t * Mathf.PI * 4) * 0.3f + Mathf.Sin(t * Mathf.PI * 12) * 0.15f + 0.5f;

                for (int di = 0; di < defects.Length; di++)
                {
                    float dtx = DefectTexX(defects[di]);
                    float dip = -defects[di].profile.severity * 0.25f *
                        Mathf.Exp(-(t - dtx) * (t - dtx) * 300f);
                    val += dip;
                }

                val = Mathf.Clamp(val, 0.05f, 0.95f);
                int py = Mathf.RoundToInt(val * h);
                py = Mathf.Clamp(py, 0, h - 1);

                bool isAnomaly = false;
                for (int di = 0; di < defects.Length; di++)
                {
                    float dtx = DefectTexX(defects[di]);
                    if (Mathf.Abs(t - dtx) < 0.02f) { isAnomaly = true; break; }
                }

                Color c = isAnomaly ? anomaly : line;
                for (int dy = -1; dy <= 1; dy++)
                    if (py + dy >= 0 && py + dy < h)
                        tex.SetPixel(x, py + dy, c);

                if (x > 0)
                {
                    float prevVal = Mathf.Sin((x - 1f) / w * Mathf.PI * 4) * 0.3f +
                        Mathf.Sin((x - 1f) / w * Mathf.PI * 12) * 0.15f + 0.5f;
                    int ppy = Mathf.RoundToInt(prevVal * h);
                    int minY = Mathf.Min(py, ppy);
                    int maxY = Mathf.Max(py, ppy);
                    for (int ly = minY; ly <= maxY; ly++)
                        if (ly >= 0 && ly < h)
                            tex.SetPixel(x, ly, c);
                }
            }

            tex.Apply();
            return tex;
        }

        static Texture2D SpectrumWave(int w, int h, DefectInstance[] defects)
        {
            var tex = NewBase(w, h);

            for (int i = 0; i < 3; i++)
            {
                Color c = i == 0 ? new Color(1f, 0.3f, 0.3f)
                    : i == 1 ? new Color(0.3f, 1f, 0.3f)
                    : new Color(0.3f, 0.5f, 1f);
                float offset = i * 1.5f;

                for (int x = 0; x < w; x++)
                {
                    float t = (float)x / w;
                    float val = Mathf.Sin((t * 8 + offset) * Mathf.PI) * 0.4f +
                        Mathf.Sin((t * 3 + offset) * Mathf.PI) * 0.2f + 0.4f;

                    for (int di = 0; di < defects.Length; di++)
                    {
                        float dtx = DefectTexX(defects[di]);
                        float spike = defects[di].profile.severity * 0.35f *
                            Mathf.Exp(-(t - dtx) * (t - dtx) * 400f);
                        val += spike;
                    }

                    val = Mathf.Clamp(val, 0f, 1f);
                    int py = Mathf.RoundToInt((0.15f + val * 0.7f) * h);
                    py = Mathf.Clamp(py, 0, h - 1);
                    tex.SetPixel(x, py, c);
                    if (py > 0) tex.SetPixel(x, py - 1, c);
                }
            }

            tex.Apply();
            return tex;
        }

        static Texture2D BarSpectrum(int w, int h, DefectInstance[] defects)
        {
            var tex = NewBase(w, h);
            int bars = 32;
            float barW = (float)w / bars;

            for (int b = 0; b < bars; b++)
            {
                float val = Mathf.Sin(b * 0.5f + 1f) * 0.4f + Mathf.Sin(b * 0.2f) * 0.3f + 0.3f;
                val = Mathf.Clamp(val, 0.1f, 1f);
                Color c = Color.Lerp(new Color(0.1f, 0.3f, 1f), new Color(1f, 0.2f, 0.1f), val);

                float barCenter = (b + 0.5f) / bars;
                for (int di = 0; di < defects.Length; di++)
                {
                    float dtx = DefectTexX(defects[di]);
                    if (Mathf.Abs(barCenter - dtx) < 0.04f)
                    {
                        val = Mathf.Clamp01(defects[di].profile.severity * 1.2f);
                        c = new Color(1f, 0.8f, 0.2f);
                        break;
                    }
                }

                int barH = Mathf.RoundToInt(val * h * 0.8f);
                int sx = Mathf.RoundToInt(b * barW);
                int ex = Mathf.RoundToInt((b + 1) * barW) - 1;
                for (int x = sx; x <= ex; x++)
                    for (int y = h - barH; y < h; y++)
                        tex.SetPixel(x, y, c);
            }

            tex.Apply();
            return tex;
        }

        static Texture2D SemImage(int w, int h, DefectInstance[] defects)
        {
            var tex = NewBase(w, h);
            Random.State state = Random.state;
            Random.InitState(42);

            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    float noise = Random.value * 0.4f + 0.1f;
                    float brightness = noise;

                    float fx = (float)x / w;
                    float fy = (float)y / h;

                    for (int di = 0; di < defects.Length; di++)
                    {
                        float dtx = DefectTexX(defects[di]);
                        float dty = DefectTexY(defects[di]);
                        float d = Mathf.Sqrt((fx - dtx) * (fx - dtx) + (fy - dty) * (fy - dty));
                        float blob = defects[di].profile.severity * 0.7f *
                            Mathf.Exp(-d * d * 300f);
                        brightness += blob;
                    }

                    brightness = Mathf.Clamp01(brightness);
                    tex.SetPixel(x, y, new Color(brightness, brightness, brightness));
                }
            }

            Random.state = state;
            tex.Apply();
            return tex;
        }

        static Texture2D ResistanceGrid(int w, int h, DefectInstance[] defects)
        {
            var tex = NewBase(w, h);
            int rows = 4;
            int cols = 6;
            float cellW = (float)w / (cols + 1);
            float cellH = (float)h / (rows + 1);
            Random.State state = Random.state;
            Random.InitState(84);

            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < cols; c++)
                {
                    float val = 0.5f + (Random.value - 0.5f) * 0.6f;
                    float cellCx = (c + 0.5f) / cols;
                    float cellCy = (r + 0.5f) / rows;

                    for (int di = 0; di < defects.Length; di++)
                    {
                        float dtx = DefectTexX(defects[di]);
                        float dty = DefectTexY(defects[di]);
                        if (Mathf.Abs(cellCx - dtx) < 0.5f / cols &&
                            Mathf.Abs(cellCy - dty) < 0.5f / rows)
                        {
                            val = 0.9f + defects[di].profile.severity * 0.5f;
                            break;
                        }
                    }

                    Color clr = val > 0.6f
                        ? Color.Lerp(new Color(0.1f, 0.5f, 0.1f), new Color(0.3f, 1f, 0.3f),
                            Mathf.Clamp01((val - 0.6f) * 4f))
                        : Color.Lerp(new Color(0.5f, 0.1f, 0.1f), new Color(0.1f, 0.5f, 0.1f),
                            Mathf.Clamp01(val * 2f));

                    if (val > 0.9f)
                        clr = new Color(1f, 0.8f, 0.2f);

                    int sx = Mathf.RoundToInt((c + 1) * cellW - cellW * 0.4f);
                    int ex = Mathf.RoundToInt((c + 1) * cellW + cellW * 0.4f);
                    int sy = Mathf.RoundToInt((r + 1) * cellH - cellH * 0.4f);
                    int ey = Mathf.RoundToInt((r + 1) * cellH + cellH * 0.4f);

                    for (int yp = sy; yp <= ey; yp++)
                        for (int xp = sx; xp <= ex; xp++)
                            if (yp >= 0 && yp < h && xp >= 0 && xp < w)
                                tex.SetPixel(xp, yp, clr);
                }
            }

            Random.state = state;
            tex.Apply();
            return tex;
        }
    }
}
