using UnityEngine;
using WafersPlease.Config;

namespace WafersPlease.Systems.Rework
{
    public class ReworkManager : MonoBehaviour
    {
        public ReworkConfigSO reworkConfig;
        public ReworkMinigameBase[] availableMinigames;

        public ReworkResult PerformRework(DefectProfileSO defect)
        {
            if (reworkConfig == null || availableMinigames.Length == 0)
            {
                return new ReworkResult { success = true, qualityRestored = 0.5f };
            }

            ReworkMinigameBase minigame = SelectMinigame(defect);
            if (minigame == null)
            {
                return new ReworkResult { success = false, qualityRestored = 0f };
            }

            minigame.StartMinigame(CalculateDifficulty(defect));
            return new ReworkResult { success = true, qualityRestored = minigame.Quality };
        }

        ReworkMinigameBase SelectMinigame(DefectProfileSO defect)
        {
            if (availableMinigames.Length == 0) return null;
            return availableMinigames[Random.Range(0, availableMinigames.Length)];
        }

        float CalculateDifficulty(DefectProfileSO defect)
        {
            return defect.severity;
        }
    }

    public struct ReworkResult
    {
        public bool success;
        public float qualityRestored;
    }
}
