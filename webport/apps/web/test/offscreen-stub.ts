/**
 * Minimal `OffscreenCanvas` for headless tests.
 *
 * `AdvancedDynamicTexture` requires one, and every view in `src/inspection/`
 * builds its panels during construction — so the scene graph cannot even be
 * assembled without it. Node has no canvas implementation, and the tests assert
 * on shift logic (phase machine, tool roster, stamp cooldown), not on pixels.
 *
 * So this is a no-op 2D context: every method does nothing and returns a benign
 * value. The few methods whose return value callers actually use are given
 * plausible answers, because a context that returns `undefined` from
 * `measureText` makes layout code throw rather than merely draw nothing.
 */

/** Values that must be objects/methods rather than bare no-ops. */
const OBJECT_RETURNS: Record<string, unknown> = {
  measureText: () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
  createLinearGradient: () => ({ addColorStop: () => {} }),
  createRadialGradient: () => ({ addColorStop: () => {} }),
  createPattern: () => null,
  getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  getLineDash: () => [],
  canvas: undefined as unknown,
};

function makeContext(width: number, height: number): unknown {
  const store: Record<string, unknown> = {
    canvas: { width, height },
    font: '',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
    ...OBJECT_RETURNS,
  };

  return new Proxy(store, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      // Any unknown method: a no-op. Layout code calls things like roundRect,
      // arcTo and drawImage; none of them need to do anything for these tests.
      return () => undefined;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
}

class TestOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext(): unknown {
    return makeContext(this.width, this.height);
  }
  /** ADT probes this to decide whether it can run without a visible canvas. */
  get onmessage(): ((e: { data: unknown }) => void) | null {
    return null;
  }
  set onmessage(_v: unknown) {}
  transferToImageBitmap(): unknown {
    return {};
  }
  convertToBlob(): Promise<unknown> {
    return Promise.resolve({});
  }
}

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = TestOffscreenCanvas;
}

/**
 * `DynamicTexture` (used by the wafer surface and the bench perforation) also
 * wants a real 2D context from the engine. NullEngine surfaces those through the
 * same path, so the proxy above covers it.
 */
export {};
/**
 * The shift session installs a document-level keydown handler for the GDD §4
 * hotkeys, and Babylon's scene observables are wired to `window`. Neither is
 * exercised by these tests, but both are touched during construction, so the
 * globals have to exist.
 *
 * The listener registry is kept so a test can assert a hotkey actually reaches
 * the shift, which is more valuable than merely having the stub in place.
 */
type Listener = (e: KeyboardEvent) => void;

const keyListeners: Listener[] = [];

if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = {
    addEventListener(type: string, fn: Listener) {
      if (type === 'keydown') keyListeners.push(fn);
    },
    removeEventListener() {},
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 720,
  };
}

/** Dispatch a keydown to every registered document listener. */
export function pressKey(key: string): void {
  for (const fn of keyListeners) fn({ key, repeat: false, preventDefault: () => {} } as unknown as KeyboardEvent);
}
