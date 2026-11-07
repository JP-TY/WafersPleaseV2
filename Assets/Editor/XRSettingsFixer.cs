using System.Collections.Generic;
using UnityEditor;
using UnityEditor.XR.Management;
using UnityEngine;
using UnityEngine.XR.Management;

[InitializeOnLoad]
public static class XRSettingsFixer
{
    static XRSettingsFixer()
    {
        EditorApplication.delayCall += FixXRSettings;
    }

    static void FixXRSettings()
    {
        var targetGroup = BuildTargetGroup.Standalone;
        var settings = XRGeneralSettingsPerBuildTarget.XRGeneralSettingsForBuildTarget(targetGroup);

        if (settings != null && settings.AssignedSettings != null)
        {
            var loaders = settings.AssignedSettings.activeLoaders;
            if (loaders != null && loaders.Count > 0)
            {
                Debug.Log("[XRSettingsFixer] Clearing XR loaders for Standalone target.");
                settings.AssignedSettings.TrySetLoaders(new List<XRLoader>());
                EditorUtility.SetDirty(settings.AssignedSettings);
            }
        }
    }
}
