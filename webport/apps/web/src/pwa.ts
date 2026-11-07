/** Phase-10 ship surface: PWA registration + secure-context note for WebXR. */

export function isSecureContext(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true;
}

export async function registerServiceWorker(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  if (!isSecureContext()) {
    console.warn(
      '[Wafers Please] Not a secure context — service worker and WebXR unavailable. Use HTTPS or localhost.',
    );
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return !!reg;
  } catch (err) {
    console.warn('[Wafers Please] SW registration failed:', err);
    return false;
  }
}
