using UnityEngine;
using UnityEngine.UI;
using WafersPlease.UI;

namespace WafersPlease.Interaction
{
    /// <summary>
    /// Shared instructional overlay shown before a rework minigame begins.
    /// Explains the objective and controls for first-time players, then invokes a
    /// callback when the player presses BEGIN. Built from the shared UITheme so it
    /// matches the rest of the UI and needs no authored art.
    /// </summary>
    public static class ReworkTutorial
    {
        /// <summary>
        /// Builds a modal tutorial card on <paramref name="parent"/> and calls
        /// <paramref name="onBegin"/> when dismissed. The overlay destroys itself first.
        /// </summary>
        public static void Show(Transform parent, string title, string objective,
            string[] controls, System.Action onBegin)
        {
            var canvas = UITheme.CreateCanvas("ReworkTutorialCanvas", parent, 130);
            UITheme.FullBackdrop(canvas.transform, new Color(0f, 0f, 0f, 0.82f));

            var card = UITheme.Panel(canvas.transform,
                new Vector2(0.24f, 0.2f), new Vector2(0.76f, 0.8f), UITheme.PanelBgSolid);
            var accent = UITheme.Panel(card.transform,
                new Vector2(0.05f, 0.9f), new Vector2(0.95f, 0.92f), UITheme.Accent);
            accent.raycastTarget = false;

            UITheme.Label(card.transform, "HOW TO: " + title, 22, FontStyle.Bold, UITheme.Accent,
                new Vector2(0.05f, 0.82f), new Vector2(0.95f, 0.9f));

            UITheme.Label(card.transform, "OBJECTIVE", 15, FontStyle.Bold, UITheme.Warn,
                new Vector2(0.07f, 0.74f), new Vector2(0.93f, 0.79f), TextAnchor.MiddleLeft);
            UITheme.Label(card.transform, objective, 15, FontStyle.Normal, UITheme.TextPrimary,
                new Vector2(0.07f, 0.58f), new Vector2(0.93f, 0.74f), TextAnchor.UpperLeft);

            UITheme.Label(card.transform, "CONTROLS", 15, FontStyle.Bold, UITheme.Warn,
                new Vector2(0.07f, 0.50f), new Vector2(0.93f, 0.55f), TextAnchor.MiddleLeft);

            string controlText = "";
            if (controls != null)
                for (int i = 0; i < controls.Length; i++)
                    controlText += "\u2022  " + controls[i] + "\n";
            UITheme.Label(card.transform, controlText, 15, FontStyle.Normal, UITheme.TextSecondary,
                new Vector2(0.07f, 0.24f), new Vector2(0.93f, 0.49f), TextAnchor.UpperLeft);

            UITheme.Button(card.transform, "BEGIN", UITheme.AccentDim,
                new Vector2(0.34f, 0.06f), new Vector2(0.66f, 0.15f), () =>
                {
                    if (canvas != null) Object.Destroy(canvas.gameObject);
                    onBegin?.Invoke();
                }, 20);
        }
    }
}
