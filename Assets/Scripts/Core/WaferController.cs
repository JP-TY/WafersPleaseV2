using System.Collections.Generic;
using UnityEngine;
using WafersPlease.Config;

namespace WafersPlease.Core
{
    public class WaferController : MonoBehaviour
    {
        public WaferState CurrentState { get; private set; }

        DefectProfileSO[] assignedDefects;
        List<DefectInstance> defectInstances;
        MaterialPropertyBlock mpb;
        Renderer rend;

        static readonly float WaferRadius = 0.14f;
        static readonly float DefectSurfaceY = 0.0095f;

        public enum WaferState
        {
            Idle,
            UnderInspection,
            AwaitingDisposition,
            Disposed
        }

public void Initialize(DefectProfileSO[] defects)
        {
            assignedDefects = defects;
            defectInstances = new List<DefectInstance>();
            CurrentState = WaferState.Idle;

            if (defects != null)
            {
                for (int i = 0; i < defects.Length; i++)
                {
                    var d = defects[i];
                    if (d == null) continue;
                    var pos = ComputeDefectPosition(i);
                    var scale = ComputeDefectScale(d.defectType, d.severity);
                    var inst = new DefectInstance(d, pos, scale);
                    inst.visualObject = BuildDefectVisual(inst);
                    defectInstances.Add(inst);
                }
            }
        }

        public DefectProfileSO[] GetDefects()
        {
            return assignedDefects ?? System.Array.Empty<DefectProfileSO>();
        }

        /// <summary>
        /// The subset of defects the player has actually revealed (with the correct
        /// metrology tool). Disposition correctness is judged against these so the
        /// player is graded on what they found, not on hidden defects.
        /// </summary>
        public DefectProfileSO[] GetDetectedDefects()
        {
            if (defectInstances == null) return System.Array.Empty<DefectProfileSO>();
            var result = new List<DefectProfileSO>();
            foreach (var inst in defectInstances)
                if (inst.isDetected && inst.profile != null)
                    result.Add(inst.profile);
            return result.ToArray();
        }

        public List<DefectInstance> GetDefectInstances()
        {
            return defectInstances ?? new List<DefectInstance>();
        }

        public List<DefectInstance> GetDetectedInstances(ToolType toolType)
        {
            var result = new List<DefectInstance>();
            if (defectInstances == null) return result;
            foreach (var inst in defectInstances)
            {
                if (inst.isDetected && inst.profile.requiredTool == toolType)
                    result.Add(inst);
            }
            return result;
        }

                readonly System.Collections.Generic.HashSet<ToolType> toolsUsed = new System.Collections.Generic.HashSet<ToolType>();

        /// <summary>Whether the player has scanned this wafer with the given metrology tool.</summary>
        public bool WasScannedWith(ToolType toolType) => toolsUsed.Contains(toolType);

        /// <summary>Total number of distinct metrology tools the player used on this wafer.</summary>
        public int ToolsUsedCount => toolsUsed.Count;

        /// <summary>
        /// True if every assigned defect has been revealed with its correct metrology tool.
        /// A clean wafer (no defects) counts as fully inspected once any tool has been used.
        /// </summary>
        public bool AllDefectsDetected()
        {
            if (defectInstances == null || defectInstances.Count == 0)
                return toolsUsed.Count > 0;
            foreach (var inst in defectInstances)
                if (!inst.isDetected) return false;
            return true;
        }

        /// <summary>Distinct metrology tools actually required to reveal all assigned defects.</summary>
        public System.Collections.Generic.HashSet<ToolType> RequiredTools()
        {
            var set = new System.Collections.Generic.HashSet<ToolType>();
            if (assignedDefects != null)
                foreach (var d in assignedDefects)
                    if (d != null) set.Add(d.requiredTool);
            return set;
        }

public List<DefectInstance> DetectForTool(ToolType toolType)
        {            toolsUsed.Add(toolType);

            var result = new List<DefectInstance>();
            if (defectInstances == null) return result;
            foreach (var inst in defectInstances)
            {
                if (inst.profile.requiredTool == toolType && !inst.isDetected)
                {
                    inst.isDetected = true;
                    result.Add(inst);
                }
            }
            return result;
        }

        static Vector3 ComputeDefectPosition(int index)
        {
            float angle = index * 137.5f;
            float r = 0.02f + (Mathf.Sin(index * 73.7f) * 0.5f + 0.5f) * (WaferRadius - 0.025f);
            float x = Mathf.Cos(angle * Mathf.Deg2Rad) * r;
            float z = Mathf.Sin(angle * Mathf.Deg2Rad) * r;
            return new Vector3(x, DefectSurfaceY, z);
        }

        static Vector3 ComputeDefectScale(DefectType type, float severity)
        {
            float s = 0.018f + severity * 0.015f;
            return type switch
            {
                DefectType.BowingWarping => new Vector3(s * 7f, s * 0.8f, s * 0.6f),
                DefectType.STIVoid => new Vector3(s * 6f, s * 0.4f, s * 0.4f),
                DefectType.InterfaceRoughness => Vector3.one * s * 1.5f,
                DefectType.SilicideBridging => new Vector3(s * 4f, s * 0.6f, s * 0.6f),
                DefectType.TungstenPlugVoid => new Vector3(s * 4f, s * 1.0f, s * 4f),
                DefectType.SubstrateContamination => new Vector3(s * 5f, s * 0.4f, s * 5f),
                _ => Vector3.one * s
            };
        }

GameObject BuildDefectVisual(DefectInstance inst)
        {
            if (inst == null || inst.profile == null) return null;

            // Defect visuals temporarily disabled per request. Detection/scoring logic
            // still runs against DefectInstance data; only the on-wafer primitive is skipped.
            return null;

#pragma warning disable CS0162 // unreachable code kept intentionally for easy re-enable
            // Pick a primitive shape that loosely fits the defect character.
            PrimitiveType shape = inst.profile.defectType switch
            {
                DefectType.TungstenPlugVoid => PrimitiveType.Cylinder,
                DefectType.STIVoid => PrimitiveType.Capsule,
                DefectType.SilicideBridging => PrimitiveType.Capsule,
                DefectType.BowingWarping => PrimitiveType.Cube,
                _ => PrimitiveType.Sphere
            };

            var go = GameObject.CreatePrimitive(shape);
            go.name = "Defect_" + inst.profile.defectType;

            // Remove the auto-added collider so it never blocks wafer interaction/raycasts.
            var col = go.GetComponent<Collider>();
            if (col != null) Object.Destroy(col);

            var tr = go.transform;
            tr.SetParent(transform, false);
            tr.localPosition = inst.localPosition;
            tr.localRotation = Quaternion.identity;
            tr.localScale = inst.baseScale;

            var mr = go.GetComponent<Renderer>();
            if (mr != null)
            {
                var mat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                Color c = ColorForDefect(inst.profile.defectType);
                mat.SetColor("_BaseColor", c);
                if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", 0.1f);
                if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 0.35f);
                // Restore original emissive glow so defects read clearly on the wafer.
                mat.EnableKeyword("_EMISSION");
                mat.SetColor("_EmissionColor", c * 0.6f);
                mr.sharedMaterial = mat;
            }

            return go;
#pragma warning restore CS0162
        }

        static Color ColorForDefect(DefectType type)
        {
            return type switch
            {
                DefectType.BowingWarping => new Color(0.95f, 0.65f, 0.15f),        // amber
                DefectType.STIVoid => new Color(0.20f, 0.55f, 0.95f),              // blue
                DefectType.InterfaceRoughness => new Color(0.85f, 0.85f, 0.30f),   // yellow
                DefectType.SilicideBridging => new Color(0.95f, 0.25f, 0.85f),     // magenta
                DefectType.TungstenPlugVoid => new Color(0.90f, 0.20f, 0.20f),     // red
                DefectType.SubstrateContamination => new Color(0.30f, 0.90f, 0.45f), // green
                _ => new Color(0.90f, 0.30f, 0.30f)
            };
        }


        void Awake()
        {
            rend = GetComponentInChildren<Renderer>();
            mpb = new MaterialPropertyBlock();
        }

        public void BeginInspection()
        {
            CurrentState = WaferState.UnderInspection;
        }

        public void CompleteDisposition()
        {
            CurrentState = WaferState.Disposed;
        }

        public void SetState(WaferState state)
        {
            CurrentState = state;
        }

public void SetHighlight(bool active)
        {
            // Restore original emission-based highlight: glow when the wafer is
            // the interaction target, clear emission otherwise.
            if (rend == null) return;
            mpb.Clear();
            if (active)
                mpb.SetColor("_EmissionColor", new Color(0.20f, 0.55f, 0.85f) * 1.2f);
            else
                mpb.SetColor("_EmissionColor", Color.black);
            rend.SetPropertyBlock(mpb);
        }

        /// <summary>No-op: the arrival glow effect was removed from the table wafer.</summary>
public void SetHighlightIntensity(float intensity)
        {
            // Restore original arrival glow: emission scales with intensity.
            if (rend == null) return;
            mpb.Clear();
            mpb.SetColor("_EmissionColor", new Color(0.20f, 0.55f, 0.85f) * Mathf.Max(0f, intensity));
            rend.SetPropertyBlock(mpb);
        }

        public void SetMetrologyVisuals(float uniformity, float roughness)
        {
            if (rend == null) return;
            mpb.SetFloat("_Uniformity", uniformity);
            mpb.SetFloat("_Roughness", roughness);
            rend.SetPropertyBlock(mpb);
        }
    }
}
