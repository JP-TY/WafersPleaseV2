using System;

namespace WafersPlease.Core
{
    [Serializable]
    public struct DispositionResult
    {
        public StampType playerDecision;
        public ActionPath chosenPath;
        public ActionPath correctAction;
        public bool isCorrect;
        public bool isFalseAccept;
        public bool isFalseReject;
        public float scorePenalty;
        public float scoreBonus;
        public float confidence;
        public string reasoning;
        public string[] breakdown;
    }
}
