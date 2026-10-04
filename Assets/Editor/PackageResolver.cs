using UnityEditor;
using UnityEngine;

public static class PackageResolver
{
    [MenuItem("Wafers/Resolve Packages")]
    public static void Resolve()
    {
        AssetDatabase.Refresh();
        Debug.Log("[PackageResolver] Packages resolved.");
    }
}
