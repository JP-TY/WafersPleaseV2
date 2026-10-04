using UnityEngine;
using WafersPlease.Interaction;
using WafersPlease.Systems.Inspection;
using WafersPlease.Systems.UI;

namespace WafersPlease.Core
{
    public class PlayerController : MonoBehaviour
    {
        IInputAdapter input;
        GameFlowController flow;
        MicroscopeController microscope;
        DefectManager defectManager;
        TravelerController traveler;
        StampController stampController;

        int currentToolIndex = -1;
        float inspectionTimer;

        void Awake()
        {
            input = GetComponent<IInputAdapter>();
            flow = GetComponent<GameFlowController>();
            microscope = GetComponentInChildren<MicroscopeController>();
            defectManager = GetComponent<DefectManager>();
            traveler = GetComponentInChildren<TravelerController>();
            stampController = GetComponentInChildren<StampController>();
        }

        void Update()
        {
            if (flow == null || !flow.IsGameActive) return;

            HandleToolSelection();
            HandleWaferInspection();
            HandleTraveler();
        }

        void HandleToolSelection()
        {
            if (input == null) return;
            int toolIdx = input.SelectedToolIndex;
            if (toolIdx >= 0 && toolIdx != currentToolIndex)
            {
                currentToolIndex = toolIdx;
                Debug.Log($"[Player] Tool selected: {toolIdx}");
            }
        }

        void HandleWaferInspection()
        {
            if (input == null || flow.CurrentWafer == null) return;

            Vector2 tilt = input.WaferTiltDelta;
            if (tilt != Vector2.zero && microscope != null)
            {
                microscope.MoveStage(tilt * 0.001f);
            }

            inspectionTimer += Time.deltaTime;
        }

        void HandleTraveler()
        {
            if (input == null) return;
            if (input.IsTravelerOpen && traveler != null)
            {
                if (traveler.IsOpen) traveler.Close();
                else if (flow.CurrentWafer != null)
                {
                    var defects = flow.CurrentWafer.GetDefects();
                    string[] defectNames = new string[defects.Length];
                    for (int i = 0; i < defects.Length; i++)
                        defectNames[i] = defects[i].displayName;
                    traveler.Open($"Wafer-{flow.CurrentWafer.name}", defectNames, "Inspecting");
                }
            }
        }

        void UpdateTraveler(WafersPlease.Config.DefectProfileSO[] detected)
        {
            if (traveler == null || !traveler.IsOpen) return;
            string[] names = new string[detected.Length];
            for (int i = 0; i < detected.Length; i++)
                names[i] = detected[i].displayName;
            traveler.Open($"Wafer-{flow.CurrentWafer.name}", names, "Defects found");
        }
    }
}
