using UnityEngine;

namespace WafersPlease.Interaction
{
    public interface IInputAdapter
    {
        bool IsVRActive { get; }

        Vector2 WaferTiltDelta { get; }
        int SelectedToolIndex { get; }
        bool IsAcceptStampPressed { get; }
        bool IsRejectStampPressed { get; }
        bool IsReworkStampPressed { get; }
        bool IsTravelerOpen { get; }
        bool IsGlossaryOpen { get; }
        bool IsPausePressed { get; }
    }
}
