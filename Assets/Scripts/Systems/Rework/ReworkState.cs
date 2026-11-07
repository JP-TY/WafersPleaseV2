namespace WafersPlease.Systems.Rework
{
    /// <summary>
    /// Cross-wafer rework state. Per GDD Section 8C, a successful CMP laser endpoint
    /// re-calibration "locks the CMP tool's automated safety braking for the next 5
    /// wafers, preventing downstream structural dishing defects." This static holder
    /// tracks that armed-brake countdown so gameplay/analytics can read it.
    /// </summary>
    public static class ReworkState
    {
        /// <summary>Number of upcoming wafers protected by the armed CMP safety brake.</summary>
        public static int CmpSafetyBrakeWafersRemaining { get; private set; }

        public static bool CmpSafetyBrakeArmed => CmpSafetyBrakeWafersRemaining > 0;

        /// <summary>Arm the automated CMP safety brake for the next N wafers (GDD: 5).</summary>
        public static void ArmCmpSafetyBrake(int wafers = 5)
        {
            CmpSafetyBrakeWafersRemaining = wafers;
        }

        /// <summary>Call once per wafer processed to decrement the protected window.</summary>
        public static void NotifyWaferProcessed()
        {
            if (CmpSafetyBrakeWafersRemaining > 0)
                CmpSafetyBrakeWafersRemaining--;
        }

        public static void Reset()
        {
            CmpSafetyBrakeWafersRemaining = 0;
        }
    }
}
