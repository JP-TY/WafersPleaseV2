using UnityEngine;
using WafersPlease.Config;
using WafersPlease.Core;

namespace WafersPlease.Systems.Scoring
{
    public class ScoreManager : MonoBehaviour
    {
        public ScoringConfigSO scoringConfig;

        public int Salary { get; private set; }
        public float Competency { get; private set; } = 100f;
        public int TotalInspected { get; private set; }
        public int CorrectDispositions { get; private set; }
        public int FalseAccepts { get; private set; }
        public int FalseRejects { get; private set; }
        public int ComplianceStrikes { get; private set; }

        /// <summary>
        /// Cosmetic operator-profile rating (requirements.md:28). Quiz boosts apply ONLY here.
        /// This value is EXCLUDED from Shift_Score and the Gate_Evaluator (dual-gate) so that
        /// seed-determined scoring (Section 16) is never altered by optional review quizzes.
        /// </summary>
        public float CumulativeCompetencyRating { get; private set; } = 100f;



public void RegisterDisposition(DispositionResult result, bool processOutOfSequence = false)
        {
            TotalInspected++;
            bool isCorrect = result.isCorrect;

            if (isCorrect) CorrectDispositions++;
            if (result.isFalseAccept) FalseAccepts++;
            if (result.isFalseReject) FalseRejects++;
            if (processOutOfSequence) ComplianceStrikes++;

            ApplyScoring(result, processOutOfSequence);
        }

void ApplyScoring(DispositionResult result, bool processOutOfSequence)
        {
            if (scoringConfig == null) return;
            bool isCorrect = result.isCorrect;
            ActionPath path = result.correctAction;

            // Magnitudes: treat config values as absolute so that a mis-signed asset
            // (e.g. a positive incorrectPenaltyMultiplier) can never turn a failure
            // into a reward. Correct answers ADD, incorrect answers SUBTRACT.
            float baseSalary = scoringConfig.baseSalaryPerWafer;
            float bonusMag = Mathf.Abs(scoringConfig.correctBonusMultiplier);
            float penaltyMag = Mathf.Abs(scoringConfig.incorrectPenaltyMultiplier);
            float compGainMag = Mathf.Abs(scoringConfig.correctCompetencyGain);
            float compPenaltyMag = Mathf.Abs(scoringConfig.incorrectCompetencyPenalty);

            // Salary: correct earns bonus; incorrect always loses the penalty amount.
            if (isCorrect)
                Salary += Mathf.RoundToInt(baseSalary * bonusMag);
            else
                Salary -= Mathf.RoundToInt(baseSalary * penaltyMag);

            // GDD Section 10 differentiated financial penalties.
            if (result.isFalseAccept)   // killer defect shipped downstream -> high penalty
                Salary -= Mathf.RoundToInt(baseSalary * 2f);
            else if (result.isFalseReject) // scrapped clean premium silicon -> moderate penalty
                Salary -= Mathf.RoundToInt(baseSalary * 1f);
            if (processOutOfSequence)      // bypassed required metrology -> minor compliance penalty
                Salary -= Mathf.RoundToInt(baseSalary * 0.25f);

            // Competency: correct actions build proficiency; incorrect actions always
            // reduce it. A false accept of a killer defect is the most damaging error.
            switch (path)
            {
                case ActionPath.Accept:
                    Competency += isCorrect ? compGainMag : -compPenaltyMag;
                    break;
                case ActionPath.Reject:
                    Competency += isCorrect ? compGainMag * 0.5f : -compPenaltyMag * 1.5f;
                    break;
                case ActionPath.Rework:
                    Competency += isCorrect ? compGainMag * 0.75f : -compPenaltyMag;
                    break;
            }
            if (result.isFalseAccept)
                Competency -= compPenaltyMag; // extra hit for killer miss
            if (processOutOfSequence)
                Competency -= compPenaltyMag * 0.25f;

            Competency = Mathf.Clamp(Competency, 0f, 100f);
        }

        /// <summary>GDD Section 12: micro-quiz competency boost (permanent, not per-shift).</summary>
        public void BoostCompetency(float amount)
        {
            // requirements.md:28 - quiz boosts must NOT affect gate-relevant Competency.
            // Redirected to the cosmetic operator-profile rating only.
            BoostOperatorProfile(amount);
        }

        /// <summary>
        /// GDD Section 12 micro-quiz reward. Applies ONLY to the cosmetic
        /// Operator_Profile.CumulativeCompetencyRating. Does not touch Shift_Score,
        /// Salary, or Competency (the dual-gate inputs). See requirements.md:28.
        /// </summary>
        public void BoostOperatorProfile(float amount)
        {
            CumulativeCompetencyRating = Mathf.Clamp(CumulativeCompetencyRating + amount, 0f, 100f);
        }

public void ResetScore()
        {
            Salary = 0;
            Competency = 100f;
            TotalInspected = 0;
            CorrectDispositions = 0;
            FalseAccepts = 0;
            FalseRejects = 0;
            ComplianceStrikes = 0;
        }

        public float GetAccuracy()
        {
            return TotalInspected > 0 ? (float)CorrectDispositions / TotalInspected : 1f;
        }
    }
}
