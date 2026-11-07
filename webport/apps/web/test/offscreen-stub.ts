/**
 * NullEngine DynamicTexture needs OffscreenCanvas in Node.
 * Minimal stub so playability tests can build labeled meshes.
 */

class StubContext {
  fillStyle = '';
  strokeStyle = '';
  font = '';
  lineWidth = 1;
  textAlign = 'left';
  textBaseline = 'top';
  fillRect(): void {}
  strokeRect(): void {}
  clearRect(): void {}
  fillText(): void {}
  strokeText(): void {}
  measureText(text: string) {
    return { width: text.length * 8 };
  }
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  stroke(): void {}
  fill(): void {}
  drawImage(): void {}
  getImageData(w = 1, h = 1) {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  putImageData(): void {}
  createImageData(w: number, h: number) {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  save(): void {}
  restore(): void {}
  scale(): void {}
  translate(): void {}
  rotate(): void {}
  setTransform(): void {}
}

class StubOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return new StubContext();
  }
  convertToBlob() {
    return Promise.resolve(new Blob());
  }
}

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  // @ts-expect-error Node polyfill
  globalThis.OffscreenCanvas = StubOffscreenCanvas;
}
