using UnityEngine;

namespace WafersPlease.Systems.Inspection
{
    public class LightingController : MonoBehaviour
    {
        public Light mainLight;
        public Light ringLight;
        public Light backLight;

        public float mainIntensity = 1.0f;
        public float ringIntensity = 0.5f;
        public float backIntensity = 0.3f;

        public enum LightingMode
        {
            Brightfield,
            Darkfield,
            UV,
            Backlight
        }

        void Start()
        {
            SetMode(LightingMode.Brightfield);
        }

        public void SetMode(LightingMode mode)
        {
            switch (mode)
            {
                case LightingMode.Brightfield:
                    SetLight(mainLight, mainIntensity, Color.white);
                    SetLight(ringLight, ringIntensity * 0.3f, Color.white);
                    SetLight(backLight, 0f, Color.white);
                    break;

                case LightingMode.Darkfield:
                    SetLight(mainLight, 0f, Color.white);
                    SetLight(ringLight, ringIntensity * 1.5f, Color.white);
                    SetLight(backLight, 0f, Color.white);
                    break;

                case LightingMode.UV:
                    SetLight(mainLight, mainIntensity * 0.8f, new Color(0.5f, 0.3f, 1f));
                    SetLight(ringLight, 0f, Color.white);
                    SetLight(backLight, 0f, Color.white);
                    break;

                case LightingMode.Backlight:
                    SetLight(mainLight, 0f, Color.white);
                    SetLight(ringLight, 0f, Color.white);
                    SetLight(backLight, backIntensity, Color.white);
                    break;
            }
        }

        void SetLight(Light light, float intensity, Color color)
        {
            if (light == null) return;
            light.intensity = intensity;
            light.color = color;
        }
    }
}
