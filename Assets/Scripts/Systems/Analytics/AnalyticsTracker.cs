using System.Collections.Generic;
using UnityEngine;
using WafersPlease;
using WafersPlease.Config;
using WafersPlease.Core;

namespace WafersPlease.Systems.Analytics
{
    public class AnalyticsTracker : MonoBehaviour
    {
        int totalWafersInspected;
        int totalAccepted;
        int totalRejected;
        int totalReworked;
        float totalInspectionTime;

        Dictionary<DefectType, int> defectTypeCounts = new();
        Dictionary<ActionPath, int> dispositionAccuracy = new()
        {
            { ActionPath.Accept, 0 },
            { ActionPath.Reject, 0 },
            { ActionPath.Rework, 0 }
        };

        public void RegisterWaferStart()
        {
            totalWafersInspected++;
        }

        public void RegisterDisposition(DispositionResult result)
        {
            switch (result.playerDecision)
            {
                case StampType.Accept: totalAccepted++; break;
                case StampType.Reject: totalRejected++; break;
                case StampType.Rework: totalReworked++; break;
            }
        }

                int totalRequiredTools;
        int totalToolsUsed;
        int complianceStrikes;
        int metrologyOptimalWafers;

        /// <summary>
        /// GDD Section 11: Metrology Optimization Rate + Process Compliance.
        /// requiredTools = distinct tools needed for this wafer's defects;
        /// toolsUsed = distinct tools the player actually ran; outOfSequence = stamped
        /// before revealing all defects with the correct tools.
        /// </summary>
        public void RegisterMetrology(int requiredTools, int toolsUsed, bool outOfSequence)
        {
            totalRequiredTools += requiredTools;
            totalToolsUsed += toolsUsed;
            if (outOfSequence) complianceStrikes++;
            // Optimal = used exactly the tools needed, no more, no fewer, and in-sequence.
            if (!outOfSequence && toolsUsed > 0 && toolsUsed <= Mathf.Max(1, requiredTools))
                metrologyOptimalWafers++;
        }

        /// <summary>Fraction of wafers inspected with an optimal tool set (0..1).</summary>
        public float MetrologyOptimizationRate =>
            totalWafersInspected > 0 ? (float)metrologyOptimalWafers / totalWafersInspected : 1f;

        public int ComplianceStrikes => complianceStrikes;

public void RegisterDefectDetected(DefectProfileSO defect)
        {
            if (!defectTypeCounts.ContainsKey(defect.defectType))
                defectTypeCounts[defect.defectType] = 0;
            defectTypeCounts[defect.defectType]++;
        }

        public void RegisterInspectionTime(float seconds)
        {
            totalInspectionTime += seconds;
        }

        public string GenerateEndOfDayReport()
        {
            return $"--- Day Report ---\n" +
                   $"Wafers: {totalWafersInspected}\n" +
                   $"Accept: {totalAccepted} | Reject: {totalRejected} | Rework: {totalReworked}\n" +
                   $"Avg time: {(totalWafersInspected > 0 ? totalInspectionTime / totalWafersInspected : 0):F1}s\n" +
                   $"Defects found: {StringifyDefectCounts()}";
        }

                /// <summary>
        /// GDD Section 11 Incident Printer diagnostic sheet: failure-mode identification,
        /// metrology optimization rate, and targeted remediation guidance.
        /// </summary>
        public string GenerateDiagnosticSheet(int falseAccepts, int falseRejects, float accuracy)
        {
            var lines = new List<string>();
            lines.Add("INCIDENT PRINTER  \u2014  OPERATIONAL DIAGNOSTIC");
            lines.Add("");
            lines.Add($"Failure-Mode Accuracy : {accuracy * 100f:F0}%");
            lines.Add($"Metrology Optimization: {MetrologyOptimizationRate * 100f:F0}%");
            lines.Add($"False Accepts (killers): {falseAccepts}   False Rejects: {falseRejects}");
            lines.Add($"Process Compliance Strikes: {complianceStrikes}");
            lines.Add("");

            // Analytical error capture + recommended remediation lab.
            if (falseAccepts > 0)
                lines.Add("\u26a0 Killer defects shipped downstream. Review Section 7 (Disposition Matrix) \u2014 catastrophic opens/shorts must be REJECTED.");
            if (falseRejects > 0)
                lines.Add("\u26a0 Clean wafers scrapped. Premium silicon wasted \u2014 confirm defect signatures before rejecting.");
            if (complianceStrikes > 0)
                lines.Add("\u26a0 Dispositions stamped before full metrology. Run the correct tool for every suspected defect before stamping.");
            if (MetrologyOptimizationRate < 0.7f)
                lines.Add("\u25b8 Recommended Lab: practice tool-to-defect mapping. Use the Electron Microscope more on backend lots.");
            if (falseAccepts == 0 && falseRejects == 0 && complianceStrikes == 0)
                lines.Add("\u2714 Clean shift. All dispositions verified with correct metrology.");

            return string.Join("\n", lines);
        }

string StringifyDefectCounts()
        {
            var parts = new List<string>();
            foreach (var kvp in defectTypeCounts)
            {
                parts.Add($"{kvp.Key}: {kvp.Value}");
            }
            return parts.Count > 0 ? string.Join(", ", parts) : "None";
        }

        public void Reset()
        {
            totalWafersInspected = 0;
            totalAccepted = 0;
            totalRejected = 0;
            totalReworked = 0;
            totalInspectionTime = 0f;
            totalRequiredTools = 0;
            totalToolsUsed = 0;
            complianceStrikes = 0;
            metrologyOptimalWafers = 0;

            defectTypeCounts.Clear();
            foreach (var key in new List<ActionPath>(dispositionAccuracy.Keys))
                dispositionAccuracy[key] = 0;
        }
    }
}
