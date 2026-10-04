using UnityEngine;
using WafersPlease.Config;
using WafersPlease.Core;

namespace WafersPlease.Systems.Wafers
{
    public class WaferSpawner : MonoBehaviour
    {
        public GameObject waferPrefab;
        public Transform spawnPoint;
        public DayConfigSO dayConfig;

        WaferController currentWafer;

        public WaferController CurrentWafer => currentWafer;
        public bool HasWafer => currentWafer != null;

        public WaferController SpawnWafer()
        {
            if (waferPrefab == null) return null;
            if (currentWafer != null)
            {
                Destroy(currentWafer.gameObject);
            }

            GameObject go = Instantiate(waferPrefab, spawnPoint.position, spawnPoint.rotation);
            currentWafer = go.GetComponent<WaferController>();

            DefectProfileSO[] defects = new DefectProfileSO[0];
            if (dayConfig != null)
            {
                defects = dayConfig.GenerateDefectSet();
                Debug.Log($"[WaferSpawner] Generated {defects.Length} defect profiles: " +
                    string.Join(", ", System.Array.ConvertAll(defects, d => d != null && !string.IsNullOrEmpty(d.displayName) ? d.displayName : "UNNAMED")));
            }
            else
            {
                Debug.LogWarning("[WaferSpawner] dayConfig is null!");
            }

            currentWafer.Initialize(defects);
            return currentWafer;
        }

        public void DespawnWafer()
        {
            if (currentWafer != null)
            {
                Destroy(currentWafer.gameObject);
                currentWafer = null;
            }
        }
    }
}
