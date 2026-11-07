using UnityEngine;
using WafersPlease.Config;
using WafersPlease.Core;

namespace WafersPlease.Systems.Progression
{
    public class DayProgressionController : MonoBehaviour
    {
        [Header("Day Events")]
        public GameEventSO dayStartEvent;
        public GameEventSO dayEndEvent;
        public GameEventSO shiftPhaseChangedEvent;

        public int CurrentDay { get; private set; } = 1;
        public ShiftPhase CurrentPhase { get; private set; } = ShiftPhase.Briefing;
        public int WafersProcessed { get; private set; }
        public int TargetWafers { get; private set; } = 10;

        public void StartDay(int day, DayConfigSO config)
        {
            CurrentDay = day;
            CurrentPhase = ShiftPhase.Briefing;
            WafersProcessed = 0;
            TargetWafers = config != null ? config.wafersPerDay : 10;

            if (GameManager.Instance != null)
            {
                GameManager.Instance.InitializeDay(day - 1);
            }

            dayStartEvent?.Raise();
        }

        public void AdvancePhase()
        {
            switch (CurrentPhase)
            {
                case ShiftPhase.Briefing:
                    CurrentPhase = ShiftPhase.Inspection;
                    break;
                case ShiftPhase.Inspection:
                    CurrentPhase = ShiftPhase.Break;
                    break;
                case ShiftPhase.Break:
                    CurrentPhase = ShiftPhase.Inspection;
                    break;
                case ShiftPhase.Review:
                    CurrentPhase = ShiftPhase.EndOfDay;
                    break;
            }

            shiftPhaseChangedEvent?.Raise();
        }

        public void RegisterWaferProcessed()
        {
            WafersProcessed++;
            if (WafersProcessed >= TargetWafers)
            {
                CurrentPhase = ShiftPhase.Review;
                shiftPhaseChangedEvent?.Raise();
            }
        }

        public void EndDay()
        {
            CurrentPhase = ShiftPhase.EndOfDay;
            dayEndEvent?.Raise();
        }
    }
}
