using UnityEngine;
using UnityEngine.Events;

namespace WafersPlease.Core
{
    [CreateAssetMenu(fileName = "NewGameEvent", menuName = "Wafers/Game Event")]
    public class GameEventSO : ScriptableObject
    {
        private UnityAction listener;

        public void Raise()
        {
            listener?.Invoke();
        }

        public void Register(UnityAction callback)
        {
            listener += callback;
        }

        public void Unregister(UnityAction callback)
        {
            listener -= callback;
        }
    }

    [CreateAssetMenu(fileName = "NewGameEvent", menuName = "Wafers/Game Event (T)")]
    public class GameEventSO<T> : ScriptableObject
    {
        private UnityAction<T> listener;

        public void Raise(T value)
        {
            listener?.Invoke(value);
        }

        public void Register(UnityAction<T> callback)
        {
            listener += callback;
        }

        public void Unregister(UnityAction<T> callback)
        {
            listener -= callback;
        }
    }
}
