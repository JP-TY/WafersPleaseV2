using UnityEngine;

namespace WafersPlease.Systems.Rework
{
    public abstract class ReworkMinigameBase : MonoBehaviour
    {
        public string minigameName;
        public float difficulty = 0.5f;
        public float timeLimit = 30f;

        protected float currentProgress;
        protected float timeRemaining;
        protected bool isComplete;

        public bool IsComplete => isComplete;
        public float Progress => currentProgress;
        public float TimeRemaining => timeRemaining;
        public virtual float Quality { get; protected set; }

        public virtual void StartMinigame(float difficultyMultiplier)
        {
            currentProgress = 0f;
            timeRemaining = timeLimit;
            isComplete = false;
            Quality = 0f;
            gameObject.SetActive(true);
        }

        public virtual void UpdateMinigame(float deltaTime)
        {
            if (isComplete) return;
            timeRemaining -= deltaTime;

            if (timeRemaining <= 0f)
            {
                CompleteMinigame(false);
            }
        }

        protected virtual void CompleteMinigame(bool success)
        {
            isComplete = true;
            gameObject.SetActive(false);
        }
    }
}
