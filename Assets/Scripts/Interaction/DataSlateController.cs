using UnityEngine;
using WafersPlease.Core;
using WafersPlease.Systems.Education;

namespace WafersPlease.Interaction
{
    /// <summary>
    /// Physical Data Slate on the workbench. Interacting with it opens the
    /// educational Glossary Tablet (GDD Section 12). Replaces the former HUD
    /// GLOSSARY button so the lookup lives on a diegetic in-world object.
    /// </summary>
    [RequireComponent(typeof(Interactable))]
    public class DataSlateController : MonoBehaviour
    {
        GameFlowController flow;
        ScaffoldingController scaffolding;

void Awake()
        {
            var interactable = GetComponent<Interactable>();
            if (interactable != null)
                interactable.onInteract.AddListener(OpenGlossary);
            CameraController.OnZoomEnd += OnExitView;
        }

        void OnDestroy()
        {
            CameraController.OnZoomEnd -= OnExitView;
        }

        void OnExitView()
        {
            // Close glossary when the player exits any zoomed view or walks away.
            if (scaffolding != null) scaffolding.CloseGlossary();
        }

        void OpenGlossary()
        {
            if (flow == null)
                flow = FindAnyObjectByType<GameFlowController>();

            if (scaffolding == null)
            {
                scaffolding = flow != null ? flow.Scaffolding
                    : FindAnyObjectByType<ScaffoldingController>();
            }

            if (scaffolding != null)
                scaffolding.OpenGlossary();
        }
    }
}
