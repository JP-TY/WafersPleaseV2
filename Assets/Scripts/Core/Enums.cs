namespace WafersPlease
{
    public enum DefectClass
    {
        Parametric,
        Catastrophic
    }

    public enum DefectType
    {
        BowingWarping,
        STIVoid,
        InterfaceRoughness,
        SilicideBridging,
        TungstenPlugVoid,
        SubstrateContamination
    }

    public enum DetectionDifficulty
    {
        Easy,
        Medium,
        Hard,
        Hidden
    }

    public enum ActionPath
    {
        Accept,
        Reject,
        Rework
    }

    public enum ToolType
    {
        StylusProfilometer,
        SpectroscopicEllipsometry,
        XRayRefractometry,
        ElectronMicroscope,
        FourPointProbe
    }

    public enum ReworkType
    {
        RCAClean,
        SilicideWetEtch,
        CMPCalibration
    }

    public enum StampType
    {
        Accept,
        Reject,
        Rework
    }

    public enum WaferStatus
    {
        Created,
        Arrived,
        Inspecting,
        Routed
    }

    public enum ShiftPhase
    {
        Briefing,
        Inspection,
        Break,
        Review,
        EndOfDay,
        Debrief,
        Complete
    }
}
