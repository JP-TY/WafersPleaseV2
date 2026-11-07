using WafersPlease;
using WafersPlease.Config;
using WafersPlease.Core;

namespace WafersPlease.Systems.Decision
{
    public class DispositionHandler
    {
        RuleMatrixSO ruleMatrix;

        public DispositionHandler(RuleMatrixSO rules)
        {
            ruleMatrix = rules;
        }

        public DispositionResult Evaluate(DefectProfileSO[] detectedDefects)
        {
            if (detectedDefects == null || detectedDefects.Length == 0)
            {
                return new DispositionResult
                {
                    chosenPath = ActionPath.Accept,
                    confidence = 1f,
                    reasoning = "No defects detected — accept wafer.",
                    breakdown = null
                };
            }

            float maxSeverity = 0f;
            DefectType worstType = DefectType.BowingWarping;
            string reasoning = "";

            foreach (DefectProfileSO defect in detectedDefects)
            {
                if (defect.severity > maxSeverity)
                {
                    maxSeverity = defect.severity;
                    worstType = defect.defectType;
                }
            }

            ActionPath suggestedPath = ActionPath.Accept;

            if (ruleMatrix != null)
            {
                RuleEntry entry = ruleMatrix.FindMatchingRule(worstType, maxSeverity);
                if (entry.defect != null)
                {
                    suggestedPath = entry.correctAction;
                    reasoning = entry.ruleText;
                }
                else
                {
                    reasoning = $"No rule found for {worstType} (severity: {maxSeverity:F2}). Defaulting to Accept.";
                }
            }
            else
            {
                if (maxSeverity > 0.7f)
                {
                    suggestedPath = ActionPath.Reject;
                    reasoning = $"Critical {worstType} detected (severity: {maxSeverity:F2}). Wafer rejected.";
                }
                else if (maxSeverity > 0.3f)
                {
                    suggestedPath = ActionPath.Rework;
                    reasoning = $"Moderate {worstType} detected (severity: {maxSeverity:F2}). Rework recommended.";
                }
                else
                {
                    reasoning = $"Minor {worstType} detected (severity: {maxSeverity:F2}). Acceptable.";
                }
            }

            return new DispositionResult
            {
                chosenPath = suggestedPath,
                correctAction = suggestedPath,
                confidence = 1f - maxSeverity,
                reasoning = reasoning,
                breakdown = null
            };
        }
    }
}
