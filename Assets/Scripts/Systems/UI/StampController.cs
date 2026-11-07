using UnityEngine;
using WafersPlease.Core;

namespace WafersPlease.Systems.UI
{
    public class StampController : MonoBehaviour
    {
        public GameObject acceptStampPrefab;
        public GameObject rejectStampPrefab;
        public GameObject reworkStampPrefab;

        public void StampDocument(ActionPath path)
        {
            GameObject prefab = path switch
            {
                ActionPath.Accept => acceptStampPrefab,
                ActionPath.Reject => rejectStampPrefab,
                ActionPath.Rework => reworkStampPrefab,
                _ => null
            };

            if (prefab != null)
            {
                Instantiate(prefab, transform.position, transform.rotation, transform.parent);
            }
            else
            {
                SpawnFallbackStamp(path);
            }
        }

        void SpawnFallbackStamp(ActionPath path)
        {
            Color col = path switch
            {
                ActionPath.Accept => Color.green,
                ActionPath.Reject => Color.red,
                ActionPath.Rework => Color.yellow,
                _ => Color.white
            };

            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            go.name = $"Stamp_{path}";
            go.transform.position = transform.position + transform.forward * 0.3f;
            go.transform.rotation = Quaternion.LookRotation(transform.forward);
            go.transform.localScale = Vector3.one * 0.15f;

            var renderer = go.GetComponent<MeshRenderer>();
            var mat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            mat.color = col;
            mat.SetFloat("_Metallic", 0.5f);
            renderer.material = mat;

            Object.Destroy(go, 1.5f);
        }
    }
}
