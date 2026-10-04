using UnityEngine;
using UnityEngine.Rendering;

namespace WafersPlease.Core
{
    public class PostProcessingSetup : MonoBehaviour
    {
        void Start()
        {
            TryEnableCamera();
            TrySetupVolume();
        }

        void TryEnableCamera()
        {
            var cam = Camera.main;
            if (cam == null) return;

            var allowPP = cam.GetType().GetProperty("allowPostProcessing");
            if (allowPP != null && allowPP.CanWrite)
            {
                bool current = (bool)allowPP.GetValue(cam);
                if (!current)
                    allowPP.SetValue(cam, true);
            }

            var aa = cam.GetType().GetProperty("antialiasing");
            if (aa != null && aa.CanWrite)
            {
                int current = (int)aa.GetValue(cam);
                if (current == 0)
                    aa.SetValue(cam, 1);
            }
        }

        void TrySetupVolume()
        {
            if (FindAnyObjectByType<Volume>() != null) return;

            var volGo = new GameObject("GlobalVolume");
            volGo.transform.SetParent(transform);

            var volume = volGo.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.sharedProfile = null;
            volume.priority = 0;

            var profile = ScriptableObject.CreateInstance<VolumeProfile>();

            TryAddBloom(profile);
            TryAddTonemapping(profile);
            TryAddVignette(profile);

            if (profile.components.Count > 0)
                volume.sharedProfile = profile;
            else
                Destroy(volGo);
        }

        static void TryAddBloom(VolumeProfile profile)
        {
            if (!profile.TryGet(out VolumeComponent _))
            {
                var type = System.Type.GetType(
                    "UnityEngine.Rendering.Universal.Bloom, Unity.RenderPipelines.Universal.Runtime");
                if (type != null)
                {
                    var bloom = profile.Add(type, true) as VolumeComponent;
                    if (bloom != null)
                        SetVolumeParams(bloom,
                            ("threshold", new MinFloatParameter(0.9f, 0f)),
                            ("intensity", new MinFloatParameter(0.5f, 0f)),
                            ("scatter", new ClampedFloatParameter(0.7f, 0f, 1f)),
                            ("tint", new ColorParameter(Color.white)),
                            ("clamp", new MinFloatParameter(10f, 0f)),
                            ("highQualityFiltering", new BoolParameter(true)));
                }
            }
        }

        static void TryAddTonemapping(VolumeProfile profile)
        {
            if (!profile.TryGet(out VolumeComponent _))
            {
                var type = System.Type.GetType(
                    "UnityEngine.Rendering.Universal.Tonemapping, Unity.RenderPipelines.Universal.Runtime");
                if (type != null)
                {
                    var tm = profile.Add(type, true) as VolumeComponent;
                    if (tm != null)
                    {
                        var modeField = tm.GetType().GetField("mode");
                        if (modeField != null)
                        {
                            var enumType = System.Type.GetType(
                                "UnityEngine.Rendering.Universal.TonemappingMode, Unity.RenderPipelines.Universal.Runtime");
                            if (enumType != null)
                            {
                                var modeVal = System.Enum.ToObject(enumType, 1);
                                var param = System.Activator.CreateInstance(
                                    modeField.FieldType, new object[] { modeVal, true }) as VolumeParameter;
                                if (param != null)
                                    modeField.SetValue(tm, param);
                            }
                        }
                    }
                }
            }
        }

        static void TryAddVignette(VolumeProfile profile)
        {
            if (!profile.TryGet(out VolumeComponent _))
            {
                var type = System.Type.GetType(
                    "UnityEngine.Rendering.Universal.Vignette, Unity.RenderPipelines.Universal.Runtime");
                if (type != null)
                {
                    var vig = profile.Add(type, true) as VolumeComponent;
                    if (vig != null)
                        SetVolumeParams(vig,
                            ("intensity", new ClampedFloatParameter(0.35f, 0f, 1f)),
                            ("smoothness", new ClampedFloatParameter(0.45f, 0f, 1f)),
                            ("rounded", new BoolParameter(true)),
                            ("color", new ColorParameter(Color.black)));
                }
            }
        }

        static void SetVolumeParams(VolumeComponent comp, params (string fieldName, VolumeParameter value)[] parameters)
        {
            foreach (var (fieldName, value) in parameters)
            {
                var field = comp.GetType().GetField(fieldName);
                if (field != null)
                    field.SetValue(comp, value);
            }
        }
    }
}
